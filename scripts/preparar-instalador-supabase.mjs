// Consolida la adaptación manual en una transacción; no conecta a Supabase.
import { readFile, writeFile } from 'node:fs/promises'
const raiz = new URL('../supabase/adaptacion/', import.meta.url)
const archivos = [
  '00_retirar_rpc_anteriores.sql',
  '01_roles_y_permisos.sql',
  '02_movimientos.sql',
  '03_asignar_responsables_rio_blanco.sql',
]
const partes = []
for (const nombre of archivos) {
  const sql = await readFile(new URL(nombre, raiz), 'utf8')
  partes.push(`\n-- === ${nombre} ===\n` + sql.replace(/^\s*(?:begin|commit);\s*$/gmi, ''))
}
const encabezado = `-- PLATAFORMA RÍO BLANCO: adaptación de la base existente diagnosticada.
-- Proyecto: yxwgqxzskicddeukwvkk. Revisar y ejecutar COMPLETO en SQL Editor.
-- Incluye la decisión autorizada: tres cuentas antiguas de Río Blanco -> RESP_UNIDAD.
-- Se conservan Auth, animales, historia, funciones antiguas y respaldos de perfiles.
-- Retira permiso EXECUTE al navegador sobre las cinco RPC antiguas.
-- Instalación única: ante cualquier error se revierte TODA la transacción.
-- No ejecutar junto con supabase/migrations (son para bases vacías).
-- Generado por scripts/preparar-instalador-supabase.mjs.
\nbegin;\n`
const verificacion = `
-- Resultado final sin nombres, correos ni UUID de usuarios.
select r.codigo as rol, u.codigo as unidad, count(*) as cuentas_activas
from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
left join public.unidades_operativas u on u.id=p.unidad_id
where p.activo group by r.codigo,u.codigo order by r.codigo,u.codigo;
commit;
`
await writeFile(new URL('INSTALAR_BASE_EXISTENTE.sql', raiz), encabezado + partes.join('\n') + verificacion)
console.log('Instalador consolidado generado. No se ejecutó SQL remoto.')
