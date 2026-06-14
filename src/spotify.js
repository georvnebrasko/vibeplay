const CLIENT_ID = 'e920c2eded02446098daac6cef398aa3'
const REDIRECT_URI = 'http://127.0.0.1:8888/callback'
const REQUEST_TIMEOUT_MS = 15000

const SCOPES = [
  'playlist-read-private',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
]

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let text = ''

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }

  return text
}

function clearStoredTokens() {
  localStorage.removeItem('spotify_access_token')
  localStorage.removeItem('spotify_refresh_token')
  localStorage.removeItem('spotify_token_expires_at')
}

function getStoredToken() {
  return localStorage.getItem('spotify_access_token')
}

function saveTokenData(data) {
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token)
  }

  if (data.refresh_token) {
    localStorage.setItem('spotify_refresh_token', data.refresh_token)
  }

  if (data.expires_in) {
    const expiresAt = Date.now() + data.expires_in * 1000
    localStorage.setItem('spotify_token_expires_at', String(expiresAt))
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Spotify request timed out', { cause: error })
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readJsonResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        data.error_description ||
        data.error ||
        fallbackMessage
    )
  }

  return data
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token')

  if (!refreshToken) {
    clearStoredTokens()
    throw new Error('Spotify session expired')
  }

  const response = await fetchWithTimeout('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await readJsonResponse(response, 'Failed to refresh Spotify token')
  saveTokenData(data)

  return data.access_token
}

async function getValidAccessToken() {
  const token = getStoredToken()
  const expiresAt = Number(localStorage.getItem('spotify_token_expires_at') || 0)

  if (!token) {
    throw new Error('Spotify is not connected')
  }

  if (expiresAt && Date.now() > expiresAt - 60000) {
    return refreshAccessToken()
  }

  return token
}

async function spotifyRequest(path, options = {}) {
  let token = await getValidAccessToken()

  async function makeRequest(accessToken) {
    return fetchWithTimeout(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })
  }

  let response = await makeRequest(token)

  if (response.status === 401) {
    token = await refreshAccessToken()
    response = await makeRequest(token)
  }

  return readJsonResponse(response, 'Spotify request failed')
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier)
  const digest = await window.crypto.subtle.digest('SHA-256', data)

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function loginSpotify() {
  const codeVerifier = generateRandomString(64)
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateRandomString(32)

  localStorage.setItem('spotify_code_verifier', codeVerifier)
  localStorage.setItem('spotify_auth_state', state)

  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
      show_dialog: 'true',
    })

  window.location.href = authUrl
}

export async function getAccessToken(code, state) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier')
  const savedState = localStorage.getItem('spotify_auth_state')

  if (!codeVerifier || !savedState || state !== savedState) {
    throw new Error('Invalid Spotify authorization response')
  }

  const response = await fetchWithTimeout('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  })

  const data = await readJsonResponse(response, 'Token error')
  saveTokenData(data)
  localStorage.removeItem('spotify_code_verifier')
  localStorage.removeItem('spotify_auth_state')

  return data.access_token
}

export async function getCurrentUser() {
  return spotifyRequest('/me')
}

export async function searchPlaylists(vibe) {
  const query = encodeURIComponent(`${vibe} playlist`)

  const data = await Promise.all([
    spotifyRequest(`/search?q=${query}&type=playlist`),
    spotifyRequest(`/search?q=${query}&type=playlist&offset=10`),
  ])

  const playlists = [
    ...(data[0].playlists?.items || []),
    ...(data[1].playlists?.items || []),
  ]

  return playlists.filter(Boolean)
}

export async function playPlaylist(playlistUri) {
  await spotifyRequest('/me/player/play', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context_uri: playlistUri,
    }),
  })
}

export async function searchSpotifyArchive(query) {
  const data = await spotifyRequest(
    `/search?q=${encodeURIComponent(query)}&type=album,track,playlist`
  )

  const albums = (data.albums?.items || []).map((item) => ({
    ...item,
    archiveType: 'album',
  }))

  const tracks = (data.tracks?.items || []).map((item) => ({
    ...item,
    archiveType: 'track',
  }))

  const playlists = (data.playlists?.items || [])
    .filter(Boolean)
    .map((item) => ({
      ...item,
      archiveType: 'playlist',
    }))

  return [...albums, ...tracks, ...playlists]
}

export async function getAlbumTracks(albumId) {
  const data = await spotifyRequest(`/albums/${albumId}/tracks?limit=50`)

  return data.items || []
}

export async function getPlaylistItems(playlistId) {
  const data = await spotifyRequest(`/playlists/${playlistId}/tracks?limit=50`)

  return data.items?.map((item) => item.track).filter(Boolean) || []
}
