import { useState } from 'react'
import { FaVolumeMute, FaVolumeUp } from 'react-icons/fa'
import { isSoundMuted, setSoundMuted } from '../sounds'

export default function SoundToggle() {
  const [muted, setMuted] = useState(isSoundMuted())

  function toggle() {
    const next = !muted
    setSoundMuted(next)
    setMuted(next)
  }

  return (
    <button
      type="button"
      className={`sound-toggle${muted ? ' muted' : ''}`}
      onClick={toggle}
      title={muted ? 'Ativar sons' : 'Desativar sons'}
    >
      {muted ? <FaVolumeMute /> : <FaVolumeUp />}
    </button>
  )
}
