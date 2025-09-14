import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import App from './App'
import './styles.css'

// Mount the React application into the root element. Wrapping the app
// in StrictMode surfaces potential problems. The Redux Provider makes
// the global store available throughout the component tree.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
)