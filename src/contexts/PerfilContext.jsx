import { createContext, useContext } from 'react'

export const PerfilContext = createContext(null)

export function usePerfil() {
  return useContext(PerfilContext)
}
