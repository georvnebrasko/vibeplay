const CLIENT_ID = 'e920c2eded02446098daac6cef398aa3'
const REDIRECT_URI = 'http://127.0.0.1:8888/callback'
const REQUEST_TIMEOUT_MS = 15000
const NEW_THIS_WEEK_MARKET = 'US'

const SCOPES = [
  'playlist-read-private',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-follow-read',
  'user-library-read',
  'user-top-read',
]

const SCOPE_SIGNATURE = SCOPES.join(' ')

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

export function getRequiredScopeSignature() {
  return SCOPE_SIGNATURE
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
  localStorage.setItem('spotify_scope_signature', SCOPE_SIGNATURE)
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

function getItemType(item) {
  if (item.archiveType || item.type) {
    return item.archiveType || item.type
  }

  return item.uri?.split(':')[1] || ''
}

function getSpotifyUrl(item) {
  if (item.external_urls?.spotify) {
    return item.external_urls.spotify
  }

  const [, type, id] = item.uri?.split(':') || []

  if (!type || !id) return ''

  return `https://open.spotify.com/${type}/${id}`
}

function openSpotifyFallback(item) {
  const url = getSpotifyUrl(item)

  if (!url) {
    console.log('No Spotify fallback URL for item', item)
    return
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch (error) {
    console.log('Failed to open Spotify fallback URL', error)
  }
}

async function getPlaybackDeviceId() {
  const data = await spotifyRequest('/me/player/devices')
  const devices = data.devices || []
  const device = devices.find((item) => item.is_active) || devices[0]

  return device?.id || ''
}

function isNoActiveDeviceError(error) {
  return String(error?.message || '')
    .toLowerCase()
    .includes('no active device')
}

export async function playSpotifyItem(item) {
  const type = getItemType(item)
  const deviceId = await getPlaybackDeviceId()

  if (!deviceId) {
    openSpotifyFallback(item)
    return
  }

  const body =
    type === 'track'
      ? { uris: [item.uri] }
      : { context_uri: item.uri }

  try {
    await spotifyRequest(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (isNoActiveDeviceError(error)) {
      openSpotifyFallback(item)
      return
    }

    throw error
  }
}

export async function playPlaylist(playlistUri) {
  await playSpotifyItem({
    archiveType: 'playlist',
    uri: playlistUri,
  })
}

export async function playAlbum(albumUri) {
  await playSpotifyItem({
    archiveType: 'album',
    uri: albumUri,
  })
}

export async function playTrack(trackUri) {
  await playSpotifyItem({
    archiveType: 'track',
    uri: trackUri,
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

function getReleaseTime(album) {
  if (!album.release_date) return 0

  const date =
    album.release_date_precision === 'year'
      ? `${album.release_date}-01-01`
      : album.release_date_precision === 'month'
        ? `${album.release_date}-01`
        : album.release_date

  const releaseDate = new Date(`${date}T00:00:00`)

  return Number.isNaN(releaseDate.getTime()) ? 0 : releaseDate.getTime()
}

function isReleasedWithinDays(album, days) {
  const releaseTime = getReleaseTime(album)

  if (!releaseTime) return false

  return Date.now() - releaseTime <= days * 24 * 60 * 60 * 1000
}

function addTasteArtist(profile, artist, source, score, reason) {
  if (!artist?.id) return

  const current = profile.artists.get(artist.id) || {
    id: artist.id,
    name: artist.name,
    score: 0,
    reasons: [],
  }

  current.name = current.name || artist.name
  current.score = Math.max(current.score, score)

  if (reason && !current.reasons.includes(reason)) {
    current.reasons.push(reason)
  }

  profile.artists.set(artist.id, current)

  if (artist.name) {
    profile.artistNames.add(artist.name.toLowerCase())
  }

  if (source) {
    profile.sources[source].add(artist.id)
  }

  ;(artist.genres || []).forEach((genre) => profile.genres.add(genre))
}

async function optionalSpotifyRequest(path) {
  try {
    return await spotifyRequest(path)
  } catch (error) {
    console.log(`Spotify optional request skipped: ${path}`, error.message)
    return null
  }
}

async function getTasteProfile() {
  const profile = {
    artists: new Map(),
    artistNames: new Set(),
    genres: new Set(),
    sources: {
      followed: new Set(),
      topArtist: new Set(),
      savedAlbum: new Set(),
      savedTrack: new Set(),
      topTrack: new Set(),
      playlist: new Set(),
      related: new Set(),
    },
  }

  const [
    followedArtists,
    savedAlbums,
    savedTracks,
    topArtists,
    topTracks,
    playlists,
  ] = await Promise.all([
    optionalSpotifyRequest('/me/following?type=artist&limit=50'),
    optionalSpotifyRequest('/me/albums?limit=50&market=US'),
    optionalSpotifyRequest('/me/tracks?limit=50&market=US'),
    optionalSpotifyRequest('/me/top/artists?limit=50&time_range=medium_term'),
    optionalSpotifyRequest('/me/top/tracks?limit=50&time_range=medium_term'),
    optionalSpotifyRequest('/me/playlists?limit=20'),
  ])

  ;(followedArtists?.artists?.items || []).forEach((artist) => {
    addTasteArtist(
      profile,
      artist,
      'followed',
      100,
      `Because you follow ${artist.name}`
    )
  })

  ;(topArtists?.items || []).forEach((artist) => {
    addTasteArtist(
      profile,
      artist,
      'topArtist',
      95,
      `Because ${artist.name} is one of your top artists`
    )
  })

  ;(savedAlbums?.items || []).forEach((item) => {
    ;(item.album?.artists || []).forEach((artist) => {
      addTasteArtist(
        profile,
        artist,
        'savedAlbum',
        70,
        `Based on albums in your library`
      )
    })
  })

  ;(savedTracks?.items || []).forEach((item) => {
    ;(item.track?.artists || []).forEach((artist) => {
      addTasteArtist(
        profile,
        artist,
        'savedTrack',
        65,
        `Based on your saved tracks`
      )
    })
  })

  ;(topTracks?.items || []).forEach((track) => {
    ;(track.artists || []).forEach((artist) => {
      addTasteArtist(
        profile,
        artist,
        'topTrack',
        80,
        `Based on your top tracks`
      )
    })
  })

  const playlistTrackGroups = await Promise.all(
    (playlists?.items || []).slice(0, 5).map((playlist) =>
      optionalSpotifyRequest(`/playlists/${playlist.id}/tracks?limit=20&market=US`)
    )
  )

  playlistTrackGroups.forEach((group) => {
    ;(group?.items || []).forEach((item) => {
      ;(item.track?.artists || []).forEach((artist) => {
        addTasteArtist(
          profile,
          artist,
          'playlist',
          50,
          `Based on artists in your playlists`
        )
      })
    })
  })

  const relatedGroups = await Promise.all(
    [...profile.artists.values()].slice(0, 5).map(async (artist) => {
      const data = await optionalSpotifyRequest(`/artists/${artist.id}/related-artists`)

      return (data?.artists || []).slice(0, 3)
    })
  )

  relatedGroups.flat().forEach((artist) => {
    const genreMatch = (artist.genres || []).find((genre) =>
      profile.genres.has(genre)
    )

    addTasteArtist(
      profile,
      artist,
      'related',
      genreMatch ? 55 : 45,
      genreMatch ? `Genre match: ${genreMatch}` : `Similar to artists in your library`
    )
  })

  return profile
}

function getAlbumRecommendation(album, tasteArtist) {
  const albumArtistIds = new Set((album.artists || []).map((artist) => artist.id))
  const matchedArtist = [...albumArtistIds]
    .map((id) => tasteArtist.artists.get(id))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0]

  if (matchedArtist) {
    return {
      score: matchedArtist.score,
      reason: matchedArtist.reasons[0] || `Because you listen to ${matchedArtist.name}`,
    }
  }

  const nameMatch = (album.artists || []).find((artist) =>
    tasteArtist.artistNames.has(artist.name?.toLowerCase())
  )

  if (nameMatch) {
    return {
      score: 50,
      reason: `Based on ${nameMatch.name} in your library`,
    }
  }

  return {
    score: 0,
    reason: '',
  }
}

function upsertScoredAlbum(albumsById, album, score, reason) {
  if (!album?.id) return

  const current = albumsById.get(album.id)
  const next = {
    ...normalizeAlbum(album),
    recommendationScore: score,
    recommendationReason: reason,
  }

  if (!current || score > current.recommendationScore) {
    albumsById.set(album.id, next)
  }
}

async function getArtistAlbums(artistId) {
  const params = new URLSearchParams({
    include_groups: 'album,single',
    market: NEW_THIS_WEEK_MARKET,
    limit: '20',
  })
  const data = await optionalSpotifyRequest(`/artists/${artistId}/albums?${params}`)

  return (data?.items || []).filter(Boolean)
}

async function searchArtistAlbums(artistName) {
  if (!artistName) return []

  const params = new URLSearchParams({
    q: `artist:"${artistName}"`,
    type: 'album',
    market: NEW_THIS_WEEK_MARKET,
    limit: '10',
  })
  const data = await optionalSpotifyRequest(`/search?${params}`)
  const normalizedArtistName = artistName.toLowerCase()

  return (data?.albums?.items || [])
    .filter(Boolean)
    .filter((album) =>
      (album.artists || []).some(
        (artist) => artist.name?.toLowerCase() === normalizedArtistName
      )
    )
}

async function getArtistsByIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 50)

  if (uniqueIds.length === 0) return []

  const data = await optionalSpotifyRequest(`/artists?ids=${uniqueIds.join(',')}`)

  return (data?.artists || []).filter(Boolean)
}

async function getPersonalizedAlbums(profile, windowDays) {
  const albumsById = new Map()
  const tasteArtists = [...profile.artists.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)

  const artistAlbumGroups = await Promise.all(
    tasteArtists.map(async (artist) => {
      const albums = await getArtistAlbums(artist.id)

      return { artist, albums }
    })
  )

  artistAlbumGroups.forEach(({ artist, albums }) => {
    albums
      .filter((album) => isReleasedWithinDays(album, windowDays))
      .forEach((album) => {
        upsertScoredAlbum(
          albumsById,
          album,
          artist.score,
          artist.reasons[0] || `Because you listen to ${artist.name}`
        )
      })
  })

  if (albumsById.size < 6) {
    const searchedAlbumGroups = await Promise.all(
      tasteArtists.slice(0, 8).map(async (artist) => {
        const albums = await searchArtistAlbums(artist.name)

        return { artist, albums }
      })
    )

    searchedAlbumGroups.forEach(({ artist, albums }) => {
      albums
        .filter((album) => isReleasedWithinDays(album, windowDays))
        .forEach((album) => {
          upsertScoredAlbum(
            albumsById,
            album,
            Math.max(40, artist.score - 10),
            artist.reasons[0] || `Because you listen to ${artist.name}`
          )
        })
    })
  }

  return albumsById
}

async function getFallbackNewReleases(profile, albumsById) {
  let data

  data = await optionalSpotifyRequest(
    `/browse/new-releases?country=${NEW_THIS_WEEK_MARKET}&limit=50`
  )

  if (!data) {
    data = await optionalSpotifyRequest(
      `/search?q=tag%3Anew&type=album&market=${NEW_THIS_WEEK_MARKET}`
    )
  }

  const fallbackAlbums = (data.albums?.items || []).filter(Boolean)
  const fallbackArtistIds = fallbackAlbums.flatMap((album) =>
    (album.artists || []).map((artist) => artist.id)
  )
  const artistDetails = new Map(
    (await getArtistsByIds(fallbackArtistIds)).map((artist) => [artist.id, artist])
  )

  fallbackAlbums.forEach((album) => {
    const recommendation = getAlbumRecommendation(album, profile)

    if (recommendation.score) {
      upsertScoredAlbum(
        albumsById,
        album,
        Math.max(10, recommendation.score - 20),
        recommendation.reason
      )
      return
    }

    const genreMatch = (album.artists || [])
      .flatMap((artist) => artistDetails.get(artist.id)?.genres || [])
      .find((genre) => profile.genres.has(genre))

    if (genreMatch) {
      upsertScoredAlbum(
        albumsById,
        album,
        25,
        `Genre match: ${genreMatch}`
      )
    }
  })
}

function normalizeAlbum(album) {
  return {
    ...album,
    archiveType: 'album',
  }
}

function normalizeAlbumTrack(track, album) {
  return {
    ...track,
    album,
    archiveType: 'track',
  }
}

export async function getNewThisWeek() {
  const profile = await getTasteProfile()
  let albumsById = await getPersonalizedAlbums(profile, 30)

  if (albumsById.size < 6) {
    albumsById = await getPersonalizedAlbums(profile, 60)
  }

  if (albumsById.size < 6) {
    await getFallbackNewReleases(profile, albumsById)
  }

  const albums = [...albumsById.values()]
    .sort((first, second) => {
      const scoreDiff =
        (second.recommendationScore || 0) - (first.recommendationScore || 0)

      if (scoreDiff) return scoreDiff

      return getReleaseTime(second) - getReleaseTime(first)
    })
    .slice(0, 12)

  const trackGroups = await Promise.all(
    albums.slice(0, 8).map(async (album) => {
      const tracks = await getAlbumTracks(album.id, NEW_THIS_WEEK_MARKET)

      return tracks.map((track) => ({
        ...normalizeAlbumTrack(track, album),
        recommendationScore: album.recommendationScore,
        recommendationReason: album.recommendationReason,
      }))
    })
  )

  return {
    albums,
    tracks: trackGroups.flat().slice(0, 24),
  }
}

export async function getAlbumTracks(albumId, market = '') {
  const params = new URLSearchParams({ limit: '50' })

  if (market) {
    params.set('market', market)
  }

  const data = await spotifyRequest(`/albums/${albumId}/tracks?${params}`)

  return data.items || []
}

export async function getPlaylistItems(playlistId) {
  const data = await spotifyRequest(`/playlists/${playlistId}/tracks?limit=50`)

  return data.items?.map((item) => item.track).filter(Boolean) || []
}
