import React from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import LoginForm from './components/Auth/LoginForm';
import AppLayout from './components/Layout/AppLayout';
import './App.css';

// Protected App Component
const ProtectedApp = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginForm />;
  }

   return (
    <ModeProvider> {/* Wrap AppLayout with ModeProvider */}
      <AppLayout />
    </ModeProvider>
  );
};

// Main App Component
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProtectedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;