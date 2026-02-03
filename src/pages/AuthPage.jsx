import AuthForm from '../components/AuthForm';

const AuthPage = ({ onLoginSuccess }) => {
  return (
    <div className="page-wrapper">
      <AuthForm onLoginSuccess={onLoginSuccess} />
    </div>
  );
};

export default AuthPage;