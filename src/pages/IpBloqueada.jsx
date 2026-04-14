import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function IpBloqueada() {
  const { ipBloqueadaInfo } = useAuth()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>

        <div style={{
          width: 96, height: 96,
          background: 'rgba(220,38,38,0.15)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          border: '2px solid #dc2626',
          fontSize: 48
        }}>🚨</div>

        <h1 style={{ color: '#ef4444', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
          ACCESO DENEGADO
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 24px' }}>
          Intento registrado — {new Date().toLocaleString('es-ES')}
        </p>

        <div style={{
          background: '#111827',
          border: '1px solid #7f1d1d',
          borderRadius: 12,
          padding: 24,
          textAlign: 'left',
          marginBottom: 24
        }}>
          <p style={{ color: '#f3f4f6', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
            ⚠️ <strong>Se enviará la IP desde donde has intentado acceder al administrador</strong> para geolocalizar tu ubicación.
          </p>
          <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
            Estás intentando entrar <strong style={{color:'#f87171'}}>fuera de las oficinas autorizadas</strong> a buscar datos confidenciales. Esta acción está <strong style={{color:'#f87171'}}>estrictamente prohibida</strong> y es sujeto a sanciones por <strong style={{color:'#fbbf24'}}>intento de robo de datos</strong>.
          </p>
          <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
            Usa <strong style={{color:'#fff'}}>FINDY</strong> de manera profesional porque saltarte las normas puede tener consecuencias legales y laborales. <strong style={{color:'#fff'}}>Nos vamos a dar cuenta.</strong>
          </p>

          <div style={{
            background: '#1f2937',
            borderRadius: 8,
            padding: 12
          }}>
            <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>
              IP registrada y enviada al administrador:
            </p>
            <p style={{ color: '#f87171', fontFamily: 'monospace', fontSize: 15, fontWeight: 700, margin: 0 }}>
              {ipBloqueadaInfo?.ip || 'Obteniendo...'}
            </p>
            {ipBloqueadaInfo?.ciudad && (
              <p style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
                📍 {ipBloqueadaInfo.ciudad}, {ipBloqueadaInfo.pais}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
          style={{
            width: '100%', padding: '14px',
            background: '#1f2937', color: '#9ca3af',
            border: '1px solid #374151', borderRadius: 12,
            fontSize: 15, cursor: 'pointer', fontWeight: 500
          }}
        >
          Cerrar sesión
        </button>

        <p style={{ color: '#374151', fontSize: 11, marginTop: 16 }}>
          Si crees que es un error, contacta con tu supervisor.
        </p>
      </div>
    </div>
  )
}
