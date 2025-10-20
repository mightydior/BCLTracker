import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Imports your main component from src/App.jsx

// This is the file the build system requires. 
// It tells React to load the App component and inject it into the 'root' element.

const container = document.getElementById('root');

if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      {/* App is the main component you have been building */}
      <App /> 
    </React.StrictMode>
  );
} else {
  // Console error if the root element isn't found in public/index.html
  console.error("The element with id='root' required by React was not found in public/index.html.");
}
