const CLIENT_ID = 'e920c2eded02446098daac6cef398aa3'
const REDIRECT_URI = 'http://127.0.0.1:8888/callback'

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

  localStorage.setItem('spotify_code_verifier', codeVerifier)

  const authUrl =
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      show_dialog: 'true',
    })

  window.location.href = authUrl
}

export async function getAccessToken(code) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier')

  const response = await fetch('https://accounts.spotify.com/api/token', {
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

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || 'Token error')
  }

  localStorage.setItem('spotify_access_token', data.access_token)

  return data.access_token
}

export async function getCurrentUser() {
  const token = localStorage.getItem('spotify_access_token')

  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return response.json()
}

export async function searchPlaylists(vibe) {
  const token = localStorage.getItem('spotify_access_token')

  const searches = await Promise.all([
    fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${vibe} playlist`)}&type=playlist`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    ),

    fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${vibe} playlist`)}&type=playlist&offset=10`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    ),
  ])

  const data = await Promise.all(
    searches.map((response) => response.json())
  )

  const playlists = [
    ...(data[0].playlists?.items || []),
    ...(data[1].playlists?.items || []),
  ]

  return playlists.filter(Boolean)
}

export async function playPlaylist(playlistUri) {
  const token = localStorage.getItem('spotify_access_token')

  const response = await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context_uri: playlistUri,
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error?.message || 'Failed to start playback')
  }
}