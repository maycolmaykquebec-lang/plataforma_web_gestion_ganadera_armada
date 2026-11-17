-- Retira el acceso del navegador a las cinco funciones heredadas diagnosticadas.
-- Conserva funciones y datos; los propietarios siguen pudiendo inspeccionarlas.
-- Usar el instalador consolidado para que toda la adaptación sea atómica.
begin;
DO $$
declare firma text; funcion regprocedure;
begin
 foreach firma in array array[
  'public.sigha_20316_solicitar_traslado(bigint,bigint,date,text,text,text)',
  'public.sigha_20320_decidir_traslado(bigint,text,text,text)',
  'public.sigha_20321_listar_pendientes()',
  'public.sigha_20421_ejecutar_traslado(bigint)',
  'public.sigha_20423_listar_aprobados()'
 ] loop
  funcion := to_regprocedure(firma);
  if funcion is null then raise exception 'No coincide el diagnóstico; falta función %',firma; end if;
  execute format('revoke all on function %s from public,anon,authenticated',funcion);
  if has_function_privilege('authenticated',funcion,'EXECUTE') or has_function_privilege('anon',funcion,'EXECUTE') then
   raise exception 'La función % conserva permisos heredados de otro rol; revisar ACL',firma;
  end if;
 end loop;
end $$;
commit;
