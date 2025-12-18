const GOOGLE_TOKEN_KEY = 'google_provider_token'

export const getGoogleToken = () => localStorage.getItem(GOOGLE_TOKEN_KEY)

export const setGoogleToken = (token) => {
  if (token) {
    localStorage.setItem(GOOGLE_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(GOOGLE_TOKEN_KEY)
  }
}

export const clearGoogleToken = () => localStorage.removeItem(GOOGLE_TOKEN_KEY)

export const hasGoogleToken = () => !!localStorage.getItem(GOOGLE_TOKEN_KEY)
