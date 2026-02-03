import { useState } from 'react';
import '../App.css';

const AuthForm = ({ onLoginSuccess }) => { 
  const [isLogin, setIsLogin] = useState(true);
  
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    password: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAction = async () => {
    setError('');

    // 1. Basic Validation (Client Side)
    if (!formData.email || !formData.password) {
        setError('Please fill in all fields.');
        return;
    }

    if (!isLogin) {
        // Register Checks
        if (!formData.fullName) {
            setError('Full Name is required.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
    }

    // 2. CONNECT TO BACKEND (The Real Logic)
    const endpoint = isLogin ? 'http://localhost:3001/login' : 'http://localhost:3001/register';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.status === 'ok') {
            if (isLogin) {
                // Login Success -> Go to Dashboard
                alert('Login Successful!');
                onLoginSuccess(); 
            } else {
                // Register Success -> Switch to Login Mode
                alert('Registration Successful! Please Sign In.');
                setIsLogin(true); // Switch tab
                setFormData({ ...formData, password: '', confirmPassword: '' }); // Clear password
            }
        } else {
            // Backend sent an error (e.g. "Wrong Password")
            setError(data.message || 'Something went wrong');
        }

    } catch (err) {
        setError('Cannot connect to server. Is backend running?');
        console.error(err);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    handleAction();
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>{isLogin ? 'Admin Login' : 'Register New Admin'}</h2>
        
        {error && <p className="error-msg">{error}</p>}

        <form onSubmit={onSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} />
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input type="password" name="password" value={formData.password} onChange={handleChange} />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} />
            </div>
          )}

          <div className="button-group">
            <button type="submit" className="action-btn primary-btn">
              {isLogin ? 'Sign In' : 'Register'}
            </button>
            <button 
              type="button" 
              className="action-btn secondary-btn"
              onClick={() => { setError(''); setIsLogin(!isLogin); }}
            >
              {isLogin ? 'Register' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthForm;