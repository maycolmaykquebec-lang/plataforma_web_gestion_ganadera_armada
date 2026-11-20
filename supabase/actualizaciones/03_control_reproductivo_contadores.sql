-- CONTROL REPRODUCTIVO 2.0: partos, montas vinculadas y antecedentes declarados.
-- Sobre la base institucional existente, DESPUES del SQL 02 de Nuevo Registro.
-- REVISAR RESPALDO y ensayar primero en un proyecto de prueba.
-- No borra filas, no modifica acontecimientos previos, ni inventa partos/montas.
-- IMPORTANTE: los registros anteriores con reproductor_codigo de texto NO se vinculan automaticamente.
begin;

DO $preflight$
begin
  if to_regclass('public.semovientes') is null or to_regclass('public.controles_reproductivos') is null
    or to_regclass('public.unidades_operativas') is null then
    raise exception 'Faltan tablas de la base institucional';
  end if;
  if to_regprocedure('private.rb_rol_actual()') is null
    or to_regprocedure('private.rb_unidad_actual()') is null
    or to_regprocedure('private.rb_puede_consultar_unidad(bigint)') is null then
    raise exception 'Falta la adaptacion de los tres roles; no se ha modificado nada';
  end if;
end;
$preflight$;

-- Relacion con el macho de la monta; NULL para datos historicos sin identificador fiable.
alter table public.controles_reproductivos
  add column if not exists reproductor_id bigint references public.semovientes(id) on delete restrict;
create index if not exists controles_reproductivos_montas_por_macho_idx
  on public.controles_reproductivos(reproductor_id, fecha_evento desc)
  where tipo_evento='monta' and reproductor_id is not null;
-- Adaptacion original: permisos INSERT solo a columnas enumeradas.
grant insert(reproductor_id) on public.controles_reproductivos to authenticated;

-- Comprobar en la BASE, no solo en la interfaz, que el macho registrado sea correcto.
create or replace function private.rb_validar_vinculo_monta()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare principal record; macho record;
begin
  if new.tipo_evento = 'monta' or new.reproductor_id is not null then
    select id, especie, sexo, unidad_id, estado
      into principal from public.semovientes where id = new.semoviente_id;
    if not found then
      raise exception 'Semoviente principal inexistente' using errcode='23503';
    end if;
    if principal.sexo <> 'Hembra' then
      raise exception 'Un servicio de monta debe asociarse a una hembra como semoviente principal' using errcode='23514';
    end if;
    if new.tipo_evento='monta' and new.reproductor_id is null then
      raise exception 'Seleccione un macho registrado para contar la monta' using errcode='23514';
    end if;
    if new.reproductor_id is not null and new.tipo_evento <> 'monta' then
      raise exception 'Solo los eventos de monta pueden vincular un reproductor_id' using errcode='23514';
    end if;
    if new.reproductor_id is not null then
      select id, especie, sexo, unidad_id, estado
        into macho from public.semovientes where id = new.reproductor_id;
      if not found or macho.sexo <> 'Macho' or macho.especie <> principal.especie
        or macho.unidad_id <> principal.unidad_id or macho.estado <> 'Activo' then
        raise exception 'El reproductor debe ser un macho activo de la misma especie y unidad' using errcode='23514';
      end if;
      new.reproductor_codigo := (select codigo from public.semovientes where id=new.reproductor_id);
      if principal.id = macho.id then
        raise exception 'No se admite el mismo animal en ambos lados de la monta' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function private.rb_validar_vinculo_monta() from public, anon, authenticated;
drop trigger if exists rb_validar_vinculo_monta on public.controles_reproductivos;
create trigger rb_validar_vinculo_monta
  before insert on public.controles_reproductivos
  for each row execute function private.rb_validar_vinculo_monta();

-- Antecedentes previos al registro digital: una declaración inicial por animal,
-- conservada sin posibilidad de modificarla desde la aplicación.
create table if not exists public.rb_antecedentes_reproductivos (
  semoviente_id bigint primary key references public.semovientes(id) on delete restrict,
  partos_previos integer not null default 0 check (partos_previos between 0 and 10000),
  montas_previas integer not null default 0 check (montas_previas between 0 and 1000000),
  fecha_referencia date not null check (fecha_referencia <= current_date),
  fuente text not null check (char_length(btrim(fuente)) between 10 and 500),
  registrado_por uuid not null default auth.uid() references auth.users(id),
  registrado_en timestamptz not null default now(),
  constraint rb_antecedentes_tipo_exclusivo check (partos_previos = 0 or montas_previas = 0)
);
alter table public.rb_antecedentes_reproductivos enable row level security;
revoke all on public.rb_antecedentes_reproductivos from public, anon, authenticated;
grant select on public.rb_antecedentes_reproductivos to authenticated;
grant insert(semoviente_id, partos_previos, montas_previas, fecha_referencia, fuente)
 on public.rb_antecedentes_reproductivos to authenticated;

drop policy if exists rb_ant_repro_lectura on public.rb_antecedentes_reproductivos;
create policy rb_ant_repro_lectura on public.rb_antecedentes_reproductivos for select to authenticated
 using (exists (
   select 1 from public.semovientes s
   where s.id=semoviente_id and private.rb_puede_consultar_unidad(s.unidad_id)
 ));
drop policy if exists rb_ant_repro_insert on public.rb_antecedentes_reproductivos;
create policy rb_ant_repro_insert on public.rb_antecedentes_reproductivos for insert to authenticated
 with check (
   private.rb_rol_actual()='RESP_UNIDAD' and registrado_por=auth.uid()
   and exists (
     select 1 from public.semovientes s
     where s.id=semoviente_id and s.unidad_id=private.rb_unidad_actual()
       and s.estado='Activo'
       and ((s.sexo='Hembra' and montas_previas=0) or (s.sexo='Macho' and partos_previos=0))
   )
 );
-- No se conceden UPDATE ni DELETE; no existen politicas de dichas operaciones.

-- RPC solo de lectura para estadisticas completas del animal autorizado.
-- El SECURITY DEFINER evita omitir montas si la hembra fue transferida,
-- pero NUNCA devuelve datos de otras hembras ni detalles de otras unidades.
create or replace function public.rb_resumen_reproductivo(p_semoviente_id bigint)
returns table (
  semoviente_id bigint,
  sexo text,
  partos_registrados bigint,
  crias_en_partos bigint,
  ultimo_parto date,
  montas_registradas bigint,
  ultima_monta date,
  partos_anteriores integer,
  montas_anteriores integer,
  antecedentes_declarados boolean,
  total_conocido bigint
)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_sexo text;
  v_partos bigint;
  v_crias bigint;
  v_parto date;
  v_montas bigint;
  v_monta date;
  v_partos_previos integer := 0;
  v_montas_previas integer := 0;
  v_existen boolean := false;
begin
  select s.sexo::text into v_sexo from public.semovientes s
  where s.id=p_semoviente_id and private.rb_puede_consultar_unidad(s.unidad_id);
  if not found then
    raise exception 'Semoviente no disponible para el perfil' using errcode='42501';
  end if;

  select count(*),coalesce(sum(c.cantidad_crias),0),max(c.fecha_evento)
    into v_partos,v_crias,v_parto
  from public.controles_reproductivos c
  where c.semoviente_id=p_semoviente_id and c.tipo_evento='parto';

  select count(*),max(c.fecha_evento) into v_montas,v_monta
  from public.controles_reproductivos c
  where c.reproductor_id=p_semoviente_id and c.tipo_evento='monta';

  select a.partos_previos,a.montas_previas,true
    into v_partos_previos,v_montas_previas,v_existen
  from public.rb_antecedentes_reproductivos a where a.semoviente_id=p_semoviente_id;
  if not found then
    v_partos_previos:=0; v_montas_previas:=0; v_existen:=false;
  end if;

  return query select p_semoviente_id,v_sexo,v_partos,v_crias,v_parto,v_montas,v_monta,
    v_partos_previos,v_montas_previas,v_existen,
    case when v_sexo='Hembra' then v_partos+v_partos_previos
         else v_montas+v_montas_previas end;
end;
$fn$;
revoke all on function public.rb_resumen_reproductivo(bigint) from public, anon, authenticated;
grant execute on function public.rb_resumen_reproductivo(bigint) to authenticated;

commit;

-- Verificaciones SOLO LECTURA (ejecutar aparte):
-- select column_name from information_schema.columns where table_schema='public'
--   and table_name='controles_reproductivos' and column_name='reproductor_id';
-- select to_regclass('public.rb_antecedentes_reproductivos');
-- select to_regprocedure('public.rb_resumen_reproductivo(bigint)');
