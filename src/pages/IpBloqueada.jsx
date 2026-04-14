import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function IpBloqueada() {
  const { logout, ipBloqueadaInfo } = useAuth()

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">

        <div className="w-24 h-24 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-red-500 animate-pulse">
          <span className="text-5xl">🚨</span>
        </div>

        <h1 className="text-2xl font-bold text-red-500 mb-2">ACCESO DENEGADO</h1>
        <p className="text-gray-400 text-sm mb-6">
          Intento de acceso registrado — {new Date().toLocaleString('es-ES')}
        </p>

        <div className="bg-gray-900 border border-red-800 rounded-xl p-6 text-left mb-6">
          <p className="text-gray-200 text-sm leading-relaxed mb-4">
            ⚠️ <strong className="text-white">Tu dirección IP ha sido registrada y enviada al administrador</strong> para geolocalizar tu ubicación.
          </p>
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            Estás intentando acceder a datos confidenciales <strong className="text-red-400">fuera de las ubicaciones autorizadas</strong>. Esta acción está <strong className="text-red-400">estrictamente prohibida</strong> y puede constituir un intento de robo de datos.
          </p>
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            Usa <strong className="text-white">FINDY</strong> de manera profesional. Saltarte las normas de acceso <strong className="text-yellow-400">tiene consecuencias legales y laborales</strong>. <strong className="text-white">Nos vamos a dar cuenta.</strong>
          </p>

          <div className="bg-gray-800 rounded-lg p-3 mt-4">
            <p className="text-xs text-gray-500 mb-1">IP registrada y enviada al admin:</p>
            <p className="font-mono text-red-400 text-sm font-bold">{ipBloqueadaInfo?.ip || 'Obteniendo...'}</p>
            {ipBloqueadaInfo?.ciudad && (
              <p className="text-xs text-gray-500 mt-1">
                Ubicación: {ipBloqueadaInfo.ciudad}, {ipBloqueadaInfo.pais}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
        >
          Cerrar sesión
        </button>

        <p className="text-xs text-gray-600 mt-4">
          Si crees que esto es un error, contacta con tu supervisor.
        </p>
      </div>
    </div>
  )
}
