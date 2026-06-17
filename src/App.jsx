import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  getAccessToken,
  getCurrentUser,
  loginSpotify,
  searchPlaylists,
  playSpotifyItem,
  searchSpotifyArchive,
  getNewThisWeek,
  getAlbumTracks,
  getPlaylistItems,
  getRequiredScopeSignature,
} from './spotify'

const NEW_THIS_WEEK_CACHE_KEY = 'vibeplay_new_this_week_cache'
const NEW_THIS_WEEK_MARKET = 'US'
const NEW_THIS_WEEK_CACHE_VERSION = 'personalized-new-releases-v1'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function readNewThisWeekCache() {
  try {
    const saved = localStorage.getItem(NEW_THIS_WEEK_CACHE_KEY)
    const cache = saved ? JSON.parse(saved) : null

    if (
      !cache ||
      cache.cacheVersion !== NEW_THIS_WEEK_CACHE_VERSION ||
      cache.market !== NEW_THIS_WEEK_MARKET ||
      !Array.isArray(cache.albums) ||
      !Array.isArray(cache.tracks) ||
      !Number.isFinite(cache.cacheUpdatedAt)
    ) {
      return null
    }

    return cache
  } catch (error) {
    console.error('Failed to read new this week cache', error)
    localStorage.removeItem(NEW_THIS_WEEK_CACHE_KEY)
    return null
  }
}

function writeNewThisWeekCache(data) {
  try {
    localStorage.setItem(
      NEW_THIS_WEEK_CACHE_KEY,
      JSON.stringify({
        ...data,
        cacheVersion: NEW_THIS_WEEK_CACHE_VERSION,
        market: NEW_THIS_WEEK_MARKET,
        cacheUpdatedAt: Date.now(),
      })
    )
  } catch (error) {
    console.error('Failed to write new this week cache', error)
  }
}

function readStoredArray(key) {
  try {
    const saved = localStorage.getItem(key)
    const value = saved ? JSON.parse(saved) : []

    return Array.isArray(value) ? value : []
  } catch (error) {
    console.error(`Failed to read ${key} from localStorage`, error)
    localStorage.removeItem(key)
    return []
  }
}

function writeStoredArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage`, error)
  }
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [page, setPage] = useState('login')

  const [vibe, setVibe] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [vibeLoading, setVibeLoading] = useState(false)
  const [vibeError, setVibeError] = useState('')

  const [playedHistory, setPlayedHistory] = useState(() =>
    readStoredArray('vibeplay_played_history')
  )

  const [archiveQuery, setArchiveQuery] = useState('')
  const [archiveResults, setArchiveResults] = useState([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState('')

  const [archive, setArchive] = useState(() =>
    readStoredArray('vibeplay_archive')
  )

  const [newThisWeek, setNewThisWeek] = useState({ albums: [], tracks: [] })
  const [newReleasesLoading, setNewReleasesLoading] = useState(false)
  const [newReleasesError, setNewReleasesError] = useState('')

  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedTracks, setSelectedTracks] = useState([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  const [editingRatings, setEditingRatings] = useState({})
  const [ratingDrafts, setRatingDrafts] = useState({})
  const [editingTrackRatings, setEditingTrackRatings] = useState({})
  const [trackRatingDrafts, setTrackRatingDrafts] = useState({})
  const detailsRequestId = useRef(0)

  useEffect(() => {
    writeStoredArray('vibeplay_archive', archive)
  }, [archive])

  useEffect(() => {
    writeStoredArray('vibeplay_played_history', playedHistory)
  }, [playedHistory])

  useEffect(() => {
    async function connectSpotify() {
      const savedToken = localStorage.getItem('spotify_access_token')
      const savedScopeSignature = localStorage.getItem('spotify_scope_signature')
      const requiredScopeSignature = getRequiredScopeSignature()

      if (savedToken) {
        if (savedScopeSignature !== requiredScopeSignature) {
          localStorage.removeItem('spotify_access_token')
          localStorage.removeItem('spotify_refresh_token')
          localStorage.removeItem('spotify_token_expires_at')
          setPage('login')
          return
        }

        try {
          await getCurrentUser()
          setIsLoggedIn(true)
          setPage('home')
          return
        } catch (error) {
          console.log(error)
          localStorage.removeItem('spotify_access_token')
        }
      }

      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')

      if (!code) return

      try {
        await getAccessToken(code, state)
        await getCurrentUser()

        setIsLoggedIn(true)
        setPage('home')

        window.history.replaceState({}, document.title, '/')
      } catch (error) {
        console.error(error)
        setPage('login')
      }
    }

    connectSpotify()
  }, [])

  async function handleVibeSearch() {
    if (!vibe.trim()) return

    setVibeLoading(true)
    setVibeError('')

    try {
      const results = await searchPlaylists(vibe)
      setPlaylists(results.filter(Boolean))
    } catch (error) {
      console.error(error)
      setVibeError(error.message || 'Failed to search playlists')
    } finally {
      setVibeLoading(false)
    }
  }

  async function handleArchiveSearch() {
    if (!archiveQuery.trim()) return

    setArchiveLoading(true)
    setArchiveError('')

    try {
      const results = await searchSpotifyArchive(archiveQuery)
      setArchiveResults(results.filter(Boolean))
    } catch (error) {
      console.error(error)
      setArchiveError(error.message || 'Failed to search Spotify')
    } finally {
      setArchiveLoading(false)
    }
  }

  const loadNewThisWeek = useCallback(async (forceRefresh = false) => {
    setNewReleasesLoading(true)
    setNewReleasesError('')

    try {
      const cache = readNewThisWeekCache()
      const isFreshCache =
        cache && Date.now() - cache.cacheUpdatedAt < WEEK_MS

      if (isFreshCache && !forceRefresh) {
        setNewThisWeek({
          albums: cache.albums,
          tracks: cache.tracks,
        })
        return
      }

      const results = await getNewThisWeek()
      setNewThisWeek(results)
      writeNewThisWeekCache(results)
    } catch (error) {
      console.error(error)
      setNewReleasesError(error.message || 'Failed to load new releases')
    } finally {
      setNewReleasesLoading(false)
    }
  }, [])

  async function handleNewThisWeekPlay(item) {
    setNewReleasesError('')

    try {
      await playSpotifyItem(item)
    } catch (error) {
      console.error(error)
      setNewReleasesError(error.message || 'Failed to start playback')
    }
  }

  function getRatingClass(rating) {
    const value = Number(rating)

    if (!rating) return 'rating-empty'
    if (value < 4) return 'rating-red'
    if (value < 7) return 'rating-yellow'
    if (value < 9) return 'rating-green'
    return 'rating-blue'
  }

  function getImage(item) {
    return item.images?.[0]?.url || item.album?.images?.[0]?.url || ''
  }

  function getSubtitle(item) {
    return (
      item.artists?.map((artist) => artist.name).join(', ') ||
      item.owner?.display_name ||
      'Unknown'
    )
  }

  function getArchiveTypeLabel(type) {
    if (type === 'track') return 'Song'
    if (type === 'album') return 'Album'
    if (type === 'playlist') return 'Playlist'
    return type
  }

  function getReleaseTypeLabel(type) {
    if (type === 'single') return 'Single'
    if (type === 'compilation') return 'Compilation'
    return 'Album'
  }

  function formatReleaseDate(date) {
    if (!date) return 'Release date unknown'

    return date
  }

  function isInArchive(item) {
    return archive.some(
      (archiveItem) =>
        archiveItem.id === item.id && archiveItem.type === item.archiveType
    )
  }

  function savePlayedPlaylist(playlist) {
    const historyItem = {
      id: playlist.id,
      name: playlist.name,
      owner: playlist.owner?.display_name || playlist.owner || 'Unknown owner',
      image: playlist.images?.[0]?.url || playlist.image || '',
      uri: playlist.uri,
    }

    setPlayedHistory((currentHistory) => {
      const filteredHistory = currentHistory.filter(
        (item) => item.id !== historyItem.id
      )

      return [historyItem, ...filteredHistory].slice(0, 20)
    })
  }

  function addToArchive(item) {
    const archiveItem = {
      id: item.id,
      type: item.archiveType,
      name: item.name,
      image: getImage(item),
      artist: getSubtitle(item),
      tracksCount:
        item.total_tracks ||
        item.tracks?.total ||
        (item.archiveType === 'track' ? 1 : 0),
      rating: '',
      uri: item.uri,
      trackRatings: {},
    }

    setArchive((currentArchive) => {
      const alreadyArchived = currentArchive.some(
        (currentItem) =>
          currentItem.id === archiveItem.id && currentItem.type === archiveItem.type
      )

      return alreadyArchived ? currentArchive : [archiveItem, ...currentArchive]
    })
    setArchiveResults([])
    setArchiveQuery('')
    setArchiveError('')
  }

  function updateItemRating(id, type, rating) {
    setArchive((currentArchive) =>
      currentArchive.map((item) =>
        item.id === id && item.type === type ? { ...item, rating } : item
      )
    )
  }

  function updateTrackRating(itemId, trackId, rating) {
    setArchive((currentArchive) =>
      currentArchive.map((item) =>
        item.id === itemId
          ? {
              ...item,
              trackRatings: {
                ...item.trackRatings,
                [trackId]: rating,
              },
            }
          : item
      )
    )

    setSelectedItem((current) =>
      current
        ? {
            ...current,
            trackRatings: {
              ...current.trackRatings,
              [trackId]: rating,
            },
          }
        : current
    )
  }

  function removeFromArchive(id, type) {
    setArchive((currentArchive) =>
      currentArchive.filter((item) => !(item.id === id && item.type === type))
    )
  }

  function openNewReleases() {
    setPage('new-releases')

    if (
      newThisWeek.albums.length === 0 &&
      newThisWeek.tracks.length === 0 &&
      !newReleasesLoading
    ) {
      loadNewThisWeek()
    }
  }

  async function openArchiveItem(item) {
    const requestId = detailsRequestId.current + 1
    detailsRequestId.current = requestId

    setSelectedItem(item)
    setSelectedTracks([])
    setDetailsError('')
    setPage('details')

    try {
      if (item.type === 'album') {
        setDetailsLoading(true)
        const tracks = await getAlbumTracks(item.id)

        if (detailsRequestId.current === requestId) {
          setSelectedTracks(tracks)
        }
      }

      if (item.type === 'playlist') {
        setDetailsLoading(true)
        const tracks = await getPlaylistItems(item.id)

        if (detailsRequestId.current === requestId) {
          setSelectedTracks(tracks)
        }
      }
    } catch (error) {
      console.error(error)

      if (detailsRequestId.current === requestId) {
        setDetailsError(error.message || 'Failed to load tracks')
      }
    } finally {
      if (detailsRequestId.current === requestId) {
        setDetailsLoading(false)
      }
    }
  }

  if (!isLoggedIn && page === 'login') {
    return (
      <main className="login-page">
        <div className="login-card">
          <p className="brand">VibePlay</p>

          <h1>Music for your mood.</h1>

          <p>
            Search Spotify by vibe, play playlists instantly, and build your own
            rated music archive.
          </p>

          <button onClick={loginSpotify}>
            Login with Spotify
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <p className="brand">VibePlay</p>

        <nav>
          <button
            className={page === 'home' ? 'nav-button active' : 'nav-button'}
            onClick={() => setPage('home')}
          >
            Home
          </button>

          <button
            className={page === 'vibe' ? 'nav-button active' : 'nav-button'}
            onClick={() => setPage('vibe')}
          >
            Vibe Search
          </button>

          <button
            className={
              page === 'new-releases' ? 'nav-button active' : 'nav-button'
            }
            onClick={openNewReleases}
          >
            Personalized New This Week
          </button>

          <button
            className={
              page === 'archive' || page === 'details'
                ? 'nav-button active'
                : 'nav-button'
            }
            onClick={() => setPage('archive')}
          >
            Archive
          </button>
        </nav>
      </aside>

      <section className="main-content">
        {page === 'home' && (
          <section className="home-page">
            <div>
              <h1>Choose mode</h1>
              <p>
                Find a playlist by vibe or rate your favorite music in your
                personal archive.
              </p>
            </div>

            <div className="mode-grid">
              <button onClick={() => setPage('vibe')}>
                <span>Vibe Search</span>
                <small>Find Spotify playlists by mood, scene or aesthetic.</small>
              </button>

              <button onClick={openNewReleases}>
                <span>Personalized New This Week</span>
                <small>Fresh releases matched to your Spotify taste.</small>
              </button>

              <button onClick={() => setPage('archive')}>
                <span>Archive</span>
                <small>Search, save and rate albums, tracks and playlists.</small>
              </button>
            </div>
          </section>
        )}

        {page === 'vibe' && (
          <section className="page">
            <header className="page-header">
              <h1>Vibe Search</h1>
              <p>Type a mood, situation or aesthetic and press Enter.</p>
            </header>

            <div className="search-bar">
              <span>⌕</span>
              <input
                value={vibe}
                onChange={(event) => setVibe(event.target.value)}
                placeholder="night drive, villain arc gym, Tokyo rain..."
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleVibeSearch()
                  }
                }}
              />
            </div>

            {vibeError && <p className="status-message error">{vibeError}</p>}
            {vibeLoading && <p className="status-message">Searching Spotify...</p>}

            <div className="list">
              {playlists.map((playlist) => (
                <div className="list-item" key={playlist.id}>
                  {playlist.images?.[0]?.url && (
                    <img
                      src={playlist.images[0].url}
                      alt={playlist.name}
                      loading="lazy"
                    />
                  )}

                  <div>
                    <h3>{playlist.name}</h3>
                    <p>{playlist.owner?.display_name || 'Unknown owner'}</p>
                  </div>

                  <button
                    className="circle-button"
                    disabled={vibeLoading}
                    onClick={async () => {
                      try {
                        await playSpotifyItem({
                          ...playlist,
                          archiveType: 'playlist',
                        })
                        savePlayedPlaylist(playlist)
                      } catch (error) {
                        console.error(error)
                        setVibeError(error.message || 'Failed to start playback')
                      }
                    }}
                  >
                    ▶
                  </button>
                </div>
              ))}
            </div>

            {playedHistory.length > 0 && (
              <section className="recent-section">
                <h2>Recently played</h2>

                <div className="recent-list">
                  {playedHistory.map((item) => (
                    <div className="recent-item" key={item.id}>
                      {item.image && (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      )}

                      <div>
                        <h3>{item.name}</h3>
                        <p>{item.owner}</p>
                      </div>

                      <button
                        className="circle-button"
                        onClick={async () => {
                          try {
                            await playSpotifyItem({
                              archiveType: 'playlist',
                              uri: item.uri,
                            })
                          } catch (error) {
                            console.error(error)
                            setVibeError(error.message || 'Failed to start playback')
                          }
                        }}
                      >
                        ▶
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {page === 'new-releases' && (
          <section className="page">
            <header className="page-header recommendations-header">
              <div>
                <h1>Personalized New This Week</h1>
                <p>
                  Fresh albums and tracks matched to artists, genres and music
                  already in your Spotify library.
                </p>
              </div>

              <button
                className="refresh-button"
                disabled={newReleasesLoading}
                onClick={() => loadNewThisWeek(true)}
              >
                Refresh
              </button>
            </header>

            {newReleasesError && (
              <p className="recommendations-note error">{newReleasesError}</p>
            )}

            {newReleasesLoading && (
              <p className="recommendations-note">Loading releases...</p>
            )}

            {!newReleasesLoading &&
              !newReleasesError &&
              newThisWeek.albums.length === 0 &&
              newThisWeek.tracks.length === 0 && (
                <p className="empty-text">No new releases found.</p>
              )}

            {newThisWeek.albums.length > 0 && (
              <section className="recommendations-section">
                <h2>Personalized New Albums</h2>

                <div className="recommendations-grid">
                  {newThisWeek.albums.map((release) => (
                    <article
                      className="recommendation-card"
                      key={`${release.archiveType}-${release.id}`}
                    >
                      {getImage(release) ? (
                        <img
                          src={getImage(release)}
                          alt={release.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="release-cover-placeholder">No cover</div>
                      )}

                      <div className="recommendation-card-content">
                        <small>
                          {getReleaseTypeLabel(release.album_type)} •{' '}
                          {formatReleaseDate(release.release_date)}
                        </small>

                        <h3>{release.name}</h3>
                        <p>{getSubtitle(release)}</p>
                        {release.recommendationReason && (
                          <p className="recommendation-reason">
                            {release.recommendationReason}
                          </p>
                        )}
                      </div>

                      <div className="recommendation-card-actions">
                        <button onClick={() => handleNewThisWeekPlay(release)}>
                          Play
                        </button>

                        <button
                          className={isInArchive(release) ? 'added' : ''}
                          onClick={() => addToArchive(release)}
                        >
                          {isInArchive(release) ? 'Added' : 'Add'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {newThisWeek.tracks.length > 0 && (
              <section className="recommendations-section">
                <h2>Personalized New Tracks</h2>

                <div className="new-track-list">
                  {newThisWeek.tracks.map((track) => (
                    <div
                      className="new-track-row"
                      key={`${track.album.id}-${track.id}`}
                    >
                      {getImage(track) && (
                        <img src={getImage(track)} alt={track.album.name} />
                      )}

                      <div>
                        <h3>{track.name}</h3>
                        <p>
                          {getSubtitle(track)} • {track.album.name}
                        </p>
                        {track.recommendationReason && (
                          <p className="recommendation-reason">
                            {track.recommendationReason}
                          </p>
                        )}
                      </div>

                      <div className="new-track-actions">
                        <button onClick={() => handleNewThisWeekPlay(track)}>
                          Play
                        </button>

                        <button
                          className={isInArchive(track) ? 'added' : ''}
                          onClick={() => addToArchive(track)}
                        >
                          {isInArchive(track) ? 'Added' : 'Add'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {page === 'archive' && (
          <section className="page">
            <header className="page-header">
              <h1>Archive</h1>
              <p>Search anything on Spotify and add it to your rated library.</p>
            </header>

            <div className="archive-search-wrap">
              <div className="search-bar">
                <span>⌕</span>
                <input
                  value={archiveQuery}
                  onChange={(event) => setArchiveQuery(event.target.value)}
                  placeholder="Search albums, songs or playlists..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleArchiveSearch()
                    }
                  }}
                />

                {archiveQuery && (
                  <button
                    className="clear-button"
                    onClick={() => {
                      setArchiveQuery('')
                      setArchiveResults([])
                      setArchiveError('')
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {archiveError && (
                <p className="status-message error">{archiveError}</p>
              )}

              {archiveLoading && (
                <p className="status-message">Searching Spotify...</p>
              )}

              {archiveResults.length > 0 && !archiveLoading && (
                <div className="search-dropdown">
                  {archiveResults.map((item) => (
                    <div
                      className="search-result"
                      key={`${item.archiveType}-${item.id}`}
                    >
                      {getImage(item) && (
                        <img src={getImage(item)} alt={item.name} loading="lazy" />
                      )}

                      <div>
                        <h3>{item.name}</h3>
                        <p>
                          {getArchiveTypeLabel(item.archiveType)} • {getSubtitle(item)}
                        </p>
                      </div>

                      <button
                        className={
                          isInArchive(item)
                            ? 'add-button added'
                            : 'add-button'
                        }
                        onClick={() => addToArchive(item)}
                      >
                        {isInArchive(item) ? '✓' : '+'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="archive-grid">
              {archive.map((item) => (
                <article className="archive-card" key={`${item.type}-${item.id}`}>
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      loading="lazy"
                      onClick={() => openArchiveItem(item)}
                    />
                  )}

                  <div
                    className="archive-card-content"
                    onClick={() => openArchiveItem(item)}
                  >
                    <h3>{item.name}</h3>
                    <p>{item.artist}</p>
                    <small>
                      {getArchiveTypeLabel(item.type)} • {item.tracksCount} tracks
                    </small>
                  </div>

                  <div className="rating-line">
                    {item.rating && !editingRatings[`${item.type}-${item.id}`] ? (
                      <strong
                        className={getRatingClass(item.rating)}
                        onClick={() => {
                          setEditingRatings({
                            ...editingRatings,
                            [`${item.type}-${item.id}`]: true,
                          })

                          setRatingDrafts({
                            ...ratingDrafts,
                            [`${item.type}-${item.id}`]: item.rating,
                          })
                        }}
                      >
                        {item.rating}/10
                      </strong>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ratingDrafts[`${item.type}-${item.id}`] ?? item.rating}
                        placeholder="Rate"
                        onChange={(event) =>
                          setRatingDrafts({
                            ...ratingDrafts,
                            [`${item.type}-${item.id}`]: event.target.value,
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            const value = ratingDrafts[`${item.type}-${item.id}`]

                            updateItemRating(item.id, item.type, value)

                            setEditingRatings({
                              ...editingRatings,
                              [`${item.type}-${item.id}`]: false,
                            })
                          }
                        }}
                      />
                    )}
                  </div>

                  <button
                    className="delete-button"
                    onClick={() => removeFromArchive(item.id, item.type)}
                  >
                    Delete
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'details' && selectedItem && (
          <section className="page">
            <button
              className="back-link"
              onClick={() => setPage('archive')}
            >
              ← Back to Archive
            </button>

            <header className="details-header">
              {selectedItem.image && (
                <img
                  src={selectedItem.image}
                  alt={selectedItem.name}
                  loading="lazy"
                />
              )}

              <div>
                <p className="details-type">{selectedItem.type}</p>
                <h1>{selectedItem.name}</h1>
                <p>{selectedItem.artist}</p>
                <strong>
                  Rating: {selectedItem.rating ? `${selectedItem.rating}/10` : 'No rating'}
                </strong>
              </div>
            </header>

            <div className="track-list">
              {detailsError && (
                <p className="status-message error">{detailsError}</p>
              )}

              {detailsLoading && (
                <p className="status-message">Loading tracks...</p>
              )}

              {selectedItem.type === 'track' && (
                <p className="empty-text">
                  This is a single track. Use the archive card to rate it.
                </p>
              )}

              {selectedTracks.map((track, index) => (
                <div className="track-row" key={track.id || index}>
                  <span>{index + 1}</span>

                  <div>
                    <h3>{track.name}</h3>
                    <p>
                      {track.artists?.map((artist) => artist.name).join(', ') ||
                        'Unknown artist'}
                    </p>
                  </div>

                  {selectedItem.trackRatings?.[track.id] &&
                  !editingTrackRatings[track.id] ? (
                    <strong
                      className={getRatingClass(selectedItem.trackRatings[track.id])}
                      onClick={() => {
                        setEditingTrackRatings({
                          ...editingTrackRatings,
                          [track.id]: true,
                        })

                        setTrackRatingDrafts({
                          ...trackRatingDrafts,
                          [track.id]: selectedItem.trackRatings[track.id],
                        })
                      }}
                    >
                      {selectedItem.trackRatings[track.id]}/10
                    </strong>
                  ) : (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={trackRatingDrafts[track.id] ?? selectedItem.trackRatings?.[track.id] ?? ''}
                      placeholder="Rate"
                      onChange={(event) =>
                        setTrackRatingDrafts({
                          ...trackRatingDrafts,
                          [track.id]: event.target.value,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          const value = trackRatingDrafts[track.id]

                          updateTrackRating(selectedItem.id, track.id, value)

                          setEditingTrackRatings({
                            ...editingTrackRatings,
                            [track.id]: false,
                          })
                        }
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
