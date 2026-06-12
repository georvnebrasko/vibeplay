import { useEffect, useState } from 'react'
import './App.css'
import {
  getAccessToken,
  getCurrentUser,
  loginSpotify,
  searchPlaylists,
  playPlaylist,
  searchSpotifyArchive,
  getAlbumTracks,
  getPlaylistItems,
} from './spotify'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [page, setPage] = useState('login')

  const [vibe, setVibe] = useState('')
  const [playlists, setPlaylists] = useState([])

  const [playedHistory, setPlayedHistory] = useState(() => {
    const saved = localStorage.getItem('vibeplay_played_history')
    return saved ? JSON.parse(saved) : []
  })

  const [archiveQuery, setArchiveQuery] = useState('')
  const [archiveResults, setArchiveResults] = useState([])

  const [archive, setArchive] = useState(() => {
    const saved = localStorage.getItem('vibeplay_archive')
    return saved ? JSON.parse(saved) : []
  })

  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedTracks, setSelectedTracks] = useState([])

  const [editingRatings, setEditingRatings] = useState({})
  const [ratingDrafts, setRatingDrafts] = useState({})
  const [editingTrackRatings, setEditingTrackRatings] = useState({})
  const [trackRatingDrafts, setTrackRatingDrafts] = useState({})

  useEffect(() => {
    localStorage.setItem('vibeplay_archive', JSON.stringify(archive))
  }, [archive])

  useEffect(() => {
    localStorage.setItem(
      'vibeplay_played_history',
      JSON.stringify(playedHistory)
    )
  }, [playedHistory])

  useEffect(() => {
    async function connectSpotify() {
      const savedToken = localStorage.getItem('spotify_access_token')

      if (savedToken) {
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

      if (!code) return

      try {
        await getAccessToken(code)
        await getCurrentUser()

        setIsLoggedIn(true)
        setPage('home')

        window.history.replaceState({}, document.title, '/')
      } catch (error) {
        console.log(error)
        setPage('login')
      }
    }

    connectSpotify()
  }, [])

  async function handleVibeSearch() {
    if (!vibe.trim()) return

    try {
      const results = await searchPlaylists(vibe)
      setPlaylists(results.filter(Boolean))
    } catch (error) {
      console.log(error)
    }
  }

  async function handleArchiveSearch() {
    if (!archiveQuery.trim()) return

    try {
      const results = await searchSpotifyArchive(archiveQuery)
      setArchiveResults(results.filter(Boolean))
    } catch (error) {
      console.log(error)
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
    if (isInArchive(item)) return

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

    setArchive([archiveItem, ...archive])
    setArchiveResults([])
    setArchiveQuery('')
  }

  function updateItemRating(id, type, rating) {
    setArchive(
      archive.map((item) =>
        item.id === id && item.type === type ? { ...item, rating } : item
      )
    )
  }

  function updateTrackRating(itemId, trackId, rating) {
    setArchive(
      archive.map((item) =>
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
    setArchive(archive.filter((item) => !(item.id === id && item.type === type)))
  }

  async function openArchiveItem(item) {
    setSelectedItem(item)
    setSelectedTracks([])
    setPage('details')

    try {
      if (item.type === 'album') {
        const tracks = await getAlbumTracks(item.id)
        setSelectedTracks(tracks)
      }

      if (item.type === 'playlist') {
        const tracks = await getPlaylistItems(item.id)
        setSelectedTracks(tracks)
      }
    } catch (error) {
      console.log(error)
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

            <div className="list">
              {playlists.map((playlist) => (
                <div className="list-item" key={playlist.id}>
                  {playlist.images?.[0]?.url && (
                    <img src={playlist.images[0].url} alt={playlist.name} />
                  )}

                  <div>
                    <h3>{playlist.name}</h3>
                    <p>{playlist.owner?.display_name || 'Unknown owner'}</p>
                  </div>

                  <button
                    className="circle-button"
                    onClick={async () => {
                      try {
                        await playPlaylist(playlist.uri)
                        savePlayedPlaylist(playlist)
                      } catch (error) {
                        console.log(error)
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
                        <img src={item.image} alt={item.name} />
                      )}

                      <div>
                        <h3>{item.name}</h3>
                        <p>{item.owner}</p>
                      </div>

                      <button
                        className="circle-button"
                        onClick={async () => {
                          try {
                            await playPlaylist(item.uri)
                          } catch (error) {
                            console.log(error)
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
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {archiveResults.length > 0 && (
                <div className="search-dropdown">
                  {archiveResults.map((item) => (
                    <div
                      className="search-result"
                      key={`${item.archiveType}-${item.id}`}
                    >
                      {getImage(item) && (
                        <img src={getImage(item)} alt={item.name} />
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
                <img src={selectedItem.image} alt={selectedItem.name} />
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