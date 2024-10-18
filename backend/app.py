# app.py

import os
import pandas as pd
import secrets
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from authlib.integrations.flask_client import OAuth
import yfinance as yf
import logging
import traceback
from dotenv import load_dotenv

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

load_dotenv()
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://127.0.0.1:5500"}}, supports_credentials=True)


app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'  # Directly configure the database URI
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'default_secret_key')  # Replace this with a secure key for production
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config.update(
    SESSION_COOKIE_SECURE=False,  # True for HTTPS environments
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax'  # Adjust if cross-domain requests are needed (set to 'None' for cross-domain)
)


db = SQLAlchemy(app)
migrate = Migrate(app, db)



# Flask-Login setup
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Configure logging
logging.basicConfig(level=logging.DEBUG)



oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    access_token_url='https://oauth2.googleapis.com/token',
    authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
    jwks_uri='https://www.googleapis.com/oauth2/v3/certs',  # Make sure this is set
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    client_kwargs={'scope': 'openid email profile'},
)


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(100))
    email = db.Column(db.String(100), unique=True)
    holdings = db.relationship('Holding', backref='user', lazy=True)
        
        
class Holding(db.Model):
    __tablename__ = 'holdings'
    id = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(10))
    quantity = db.Column(db.Integer)
    purchase_price = db.Column(db.Float)
    user_id = db.Column(db.String(64), db.ForeignKey('users.id'), nullable=False)
        
        
@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, user_id)


@app.route('/api/get-user', methods=['GET'])
@login_required
def get_user():
    # Fetch user data from session
    userinfo = session.get('user', {})
    return jsonify(userinfo)


@app.route('/login')
def login():
    nonce = secrets.token_urlsafe(16)
    session['nonce'] = nonce  # Store the nonce in session
    
    # Add 'state' parameter as a secure random token
    state = secrets.token_urlsafe(16)
    session['state'] = state  # Store state in session
    
    redirect_uri = url_for('authorize', _external=True)
    return google.authorize_redirect(redirect_uri, nonce=nonce, state=state, prompt='login')


@app.route('/authorize')
def authorize():
    # Verify the state (for CSRF prevention)
    state_in_request = request.args.get('state')
    state_in_session = session.get('state')
    if state_in_request != state_in_session:
        return jsonify({'error': 'State mismatch detected, possible CSRF attempt.'}), 400

    token = google.authorize_access_token()
    nonce = session.get('nonce')

    userinfo = google.parse_id_token(token, nonce=nonce)
    if userinfo:
        user = User.query.filter_by(email=userinfo['email']).first()
        if not user:
            # Create a new user if they don't exist
            user = User(id=userinfo['sub'], name=userinfo['name'], email=userinfo['email'])
            db.session.add(user)
            db.session.commit()
        
        login_user(user)  # Log the user in (Flask-Login will handle the session)
        session['user'] = userinfo
        return redirect('/portfolio')  # Redirect back to frontend
    
    return jsonify({'error': 'Authorization failed'}), 400


@app.route('/logout')
@login_required
def logout():
    print(f"Before logout: {session}")
    logout_user()
    session.clear()  # Clears all session data
    print(f"After logout: {session}")
    return redirect(url_for('index'))

@app.route('/api/save-stock', methods=['POST'])
@login_required  # Ensure the user is logged in to save stock
def save_stock():
    try:
        # Get the current user's ID
        user_id = current_user.id

        # Get stock data from the POST request body (JSON)
        stock_data = request.json
        symbol = stock_data.get('symbol').upper()
        quantity = stock_data.get('quantity')
        purchase_price = stock_data.get('purchasePrice')

        # Validate input data
        if not symbol or quantity is None or purchase_price is None:
            return jsonify({'error': 'Invalid input data'}), 400

        new_holding = Holding(
            symbol=symbol,
            quantity=quantity,
            purchase_price=purchase_price,
            user_id=user_id
        )
        db.session.add(new_holding)

        db.session.commit()

        return jsonify({'message': 'Stock saved successfully!', 'stockid':new_holding.id}), 200
    except Exception as e:
        db.session.rollback()  # Rollback in case of error
        logging.error(f"Error saving stock: {e}")
        traceback.print_exc()
        return jsonify({'error': 'Failed to save stock.'}), 500

@app.route('/api/delete-stock/<int:holding_id>', methods=['DELETE'])
@login_required
def delete_stock(holding_id):
    try:
        user_id = current_user.id
        # Find the specific holding by its id and user_id
        holding = Holding.query.filter_by(id=holding_id, user_id=user_id).first()
        
        if holding:
            db.session.delete(holding)
            db.session.commit()
            return jsonify({'message': f'Holding {holding.symbol} deleted successfully.'}), 200
        else:
            return jsonify({'error': 'Holding not found.'}), 404
    except Exception as e:
        return jsonify({'error': 'Error deleting holding: ' + str(e)}), 500


@app.route('/api/stock/<symbol>/history', methods=['GET'])
def get_stock_history(symbol):
    try:
        period = request.args.get('period', '1y')
        logging.debug(f"Fetching historical data for {symbol} with period {period}")
        hist = yf.download(symbol, period=period)  # Removed session=session

        if hist.empty:
            raise ValueError(f"No historical data found for symbol: {symbol}")

        hist.reset_index(inplace=True)
        hist['Date'] = hist['Date'].dt.strftime('%Y-%m-%d')
        hist = hist[['Date', 'Close']]
        data = hist.to_dict(orient='records')

        logging.debug(f"Historical data for {symbol}: {data[:5]}...")  # Log first 5 records

        return jsonify(data), 200
    except Exception as e:
        logging.error(f"Error fetching historical data for {symbol}: {e}")
        traceback.print_exc()
        return jsonify({'error': f"Failed to fetch historical data for {symbol}. {str(e)}"}), 500

@app.route('/api/get-holdings', methods=['GET'])
@login_required
def get_holdings():
    try:
        user_id = current_user.id
        holdings = Holding.query.filter_by(user_id=user_id).all()
        
        holdings_list = []

        for holding in holdings:
            try:
                # Fetch current stock data (e.g., current price)
                stock = yf.Ticker(holding.symbol)
                info = stock.info

                current_price = (
                    info.get('regularMarketPrice') or
                    info.get('currentPrice') or
                    info.get('previousClose')
                )
                if current_price is None:
                    current_price = 0  # Set to 0 if unable to fetch

                # Calculate target price
                current_pe = info.get('trailingPE') or 0
                forward_pe = info.get('forwardPE') or current_pe
                target_price = (current_price * (current_pe / forward_pe)) if forward_pe > 0 else current_price

                # Calculate unrealized gain/loss
                unrealized_gain_loss = (current_price - holding.purchase_price) * holding.quantity

                # Fetch historical data in one go
                historical_data = yf.download(holding.symbol, period="1y")
                historical_data.reset_index(inplace=True)
                historical_data['Date'] = historical_data['Date'].dt.strftime('%Y-%m-%d')
                historical_data = historical_data[['Date', 'Close']].to_dict(orient='records')

                holdings_list.append({
                    'id': holding.id,
                    'symbol': holding.symbol,
                    'quantity': holding.quantity,
                    'purchase_price': holding.purchase_price,
                    'currentPE': current_pe,
                    'forwardPE': forward_pe,
                    'current_price': current_price,
                    'target_price': target_price,
                    'unrealized_gain_loss': unrealized_gain_loss,
                    'historicalData': historical_data  # Include historical data
                })
            
            except Exception as e:
                # If fetching stock data fails, add a message to the holdings
                holdings_list.append({
                    'id': holding.id,
                    'symbol': holding.symbol,
                    'quantity': holding.quantity,
                    'purchase_price': holding.purchase_price,
                    'current_price': None,
                    'target_price': None,
                    'unrealized_gain_loss': None,
                    'historicalData': [],
                    'error': f'Error fetching data for {holding.symbol}: {str(e)}'
                })
        
        return jsonify(holdings_list), 200

    except Exception as e:
        return jsonify({'error': 'Unable to fetch holdings: ' + str(e)}), 500



@app.route('/auth')
def auth():
    return render_template('login.html')


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/portfolio')
@login_required
def portfolio():
    return render_template('portfolio.html')

stock_cache = {}

@app.route('/api/stock/<symbol>', methods=['GET'])
def get_stock_data(symbol):
    try:
        logging.debug(f"Fetching stock data for {symbol}")
        stock = yf.Ticker(symbol)
        info = stock.info

        if not info:
            raise ValueError(f"No data found for symbol: {symbol}")

        current_price = (
            info.get('regularMarketPrice') or
            info.get('currentPrice') or
            info.get('previousClose')
        )

        if current_price is None:
            raise ValueError(f"Invalid symbol or no data found for symbol: {symbol}")

        data = {
            'symbol': symbol.upper(),
            'currentPrice': current_price,
            'currentPE': info.get('trailingPE'),
            'forwardPE': info.get('forwardPE')
        }
        
        stock_cache[symbol] = data  # Cache the stock data
        
        logging.debug(f"Stock data for {symbol}: {data}")

        return jsonify(data), 200
    except Exception as e:
        logging.error(f"Error fetching data for {symbol}: {e}")
        traceback.print_exc()
        return jsonify({'error': f"Failed to fetch data for {symbol}. {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)
