import { useEffect, useState } from 'react'
import './App.css'
import {
  getAccessToken,
  getCurrentUser,
  loginSpotify,
  searchPlaylists,
  playPlaylist,
} from './spotify'

function App() {
  const [status, setStatus] = useState('Not connected')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [vibe, setVibe] = useState('')
  const [playlists, setPlaylists] = useState([])

  useEffect(() => {
    async function connectSpotify() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (!code) {
        return
      }

      try {
        await getAccessToken(code)
        const user = await getCurrentUser()

        setStatus(`Spotify connected: ${user.display_name}`)
        setIsLoggedIn(true)

        window.history.replaceState({}, document.title, '/')
      } catch {
        setStatus('Spotify connection failed')
      }
    }

    connectSpotify()
  }, [])

  async function handleSearch() {
    if (!vibe.trim()) {
      setStatus('Type a vibe first')
      return
    }

    setStatus('Searching Spotify...')

    try {
      const results = await searchPlaylists(vibe)
      const cleanResults = results.filter(Boolean)

      setPlaylists(cleanResults)
      setStatus(`Found ${cleanResults.length} playlists`)
    } catch (error) {
      console.log(error)
      setStatus(`Search failed: ${error.message}`)
    }
  }

  return (
    <main className="app">
      <section className="card">
        <p className="label">VibePlay</p>

        <h1>Find music by vibe</h1>

        <p className="description">{status}</p>

        {!isLoggedIn && (
          <button onClick={loginSpotify}>
            Login with Spotify
          </button>
        )}

        <input
          value={vibe}
          onChange={(event) => setVibe(event.target.value)}
          placeholder="training vibe, night drive, villain arc gym..."
        />

        <button onClick={handleSearch}>
          Find playlists
        </button>

        <div className="results">
          {playlists.map((playlist) => (
            <div className="playlist" key={playlist.id}>
              {playlist.images?.[0]?.url && (
                <img
                  src={playlist.images[0].url}
                  alt={playlist.name}
                />
              )}

              <div>
                <h3>{playlist.name || 'Unknown playlist'}</h3>
                <p>{playlist.owner?.display_name || 'Unknown owner'}</p>
              </div>

              <button
                className="small-button"
                onClick={async () => {
                  try {
                    setStatus(`Playing: ${playlist.name}`)
                    await playPlaylist(playlist.uri)
                  } catch (error) {
                    console.log(error)
                    setStatus(`Failed: ${error.message}`)
                  }
                }}
              >
                Play
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App