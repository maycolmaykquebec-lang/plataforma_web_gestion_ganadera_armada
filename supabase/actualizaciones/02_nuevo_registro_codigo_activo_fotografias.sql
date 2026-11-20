-- NUEVO REGISTRO: codigo del activo + 3 fotografias por semoviente.
-- Para la BASE EXISTENTE que ya recibio la adaptacion de los tres roles.
-- Ejecutar manualmente en Supabase SQL Editor, idealmente primero en copia de prueba.
-- NO reemplaza ni ejecuta supabase/adaptacion/INSTALAR_BASE_EXISTENTE.sql.
-- No elimina ni cambia codigos existentes. Los registros anteriores conservan codigo_activo = NULL.

begin;

DO $comprobacion$
begin
  if to_regclass('public.semovientes') is null
     or to_regclass('public.unidades_operativas') is null
     or to_regclass('public.perfiles') is null then
    raise exception 'No esta disponible el esquema institucional esperado';
  end if;
  if to_regprocedure('private.rb_rol_actual()') is null
     or to_regprocedure('private.rb_unidad_actual()') is null
     or to_regprocedure('private.rb_puede_consultar_unidad(bigint)') is null then
    raise exception 'Antes de esta actualizacion hay que revisar/aplicar la adaptacion de tres roles. No se hizo ningun cambio';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Este proyecto Supabase no tiene disponible el esquema Storage';
  end if;
  if exists (select 1 from storage.buckets where id = 'semovientes-fotos' and public) then
    raise exception 'Ya hay un bucket semovientes-fotos PUBLICO: revisarlo manualmente antes de continuar';
  end if;
end;
$comprobacion$;

-- Mantener NULL para los animales anteriores evita inventar codigos institucionales.
alter table public.semovientes
  add column if not exists codigo_activo varchar(110);

create unique index if not exists semovientes_unidad_codigo_activo_uq
  on public.semovientes(unidad_id, codigo_activo)
  where codigo_activo is not null;

-- La base heredada usa privilegios INSERT limitados por columna.
grant insert(codigo_activo) on public.semovientes to authenticated;

-- En nuevos registros verificar que el codigo de activo corresponde a su unidad.
-- No reescribe filas historicas ni interviene durante los traslados (UPDATE).
create or replace function private.rb_validar_nuevo_codigo_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  codigo_unidad text;
  prefijo text;
begin
  select u.codigo::text into codigo_unidad
    from public.unidades_operativas u where u.id = new.unidad_id;

  prefijo := case codigo_unidad
    when 'RIO-BLANCO' then 'UOSPGRB-86-WI-'
    when 'TAMARINERO' then 'UOSPGT-86-WI-'
    when 'MAMORE' then 'UOSPGM-86-WI-'
    else null
  end;

  if prefijo is null
     or new.codigo_activo is null
     or left(new.codigo_activo, length(prefijo)) <> prefijo
     or substring(new.codigo_activo from length(prefijo) + 1) !~ '^[A-Z0-9-]{3,50}$' then
    raise exception 'Codigo del Activo invalido para la unidad %', coalesce(codigo_unidad, 'sin unidad')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.rb_validar_nuevo_codigo_activo() from public, anon, authenticated;

drop trigger if exists rb_validar_codigo_activo_nuevo on public.semovientes;
create trigger rb_validar_codigo_activo_nuevo
  before insert on public.semovientes
  for each row execute function private.rb_validar_nuevo_codigo_activo();

create table if not exists public.semoviente_fotografias (
  semoviente_id bigint not null references public.semovientes(id) on delete restrict,
  vista text not null check (vista in ('frontal', 'lateral_izquierdo', 'lateral_derecho')),
  ruta text not null unique,
  registrado_por uuid not null default auth.uid() references auth.users(id),
  registrado_en timestamptz not null default now(),
  primary key (semoviente_id, vista)
);

alter table public.semoviente_fotografias enable row level security;
revoke all on public.semoviente_fotografias from public, anon, authenticated;
grant select, insert(semoviente_id, vista, ruta) on public.semoviente_fotografias to authenticated;

drop policy if exists rb_fotos_lectura on public.semoviente_fotografias;
create policy rb_fotos_lectura on public.semoviente_fotografias
  for select to authenticated
  using (
    exists (
      select 1 from public.semovientes s
      where s.id = semoviente_id
        and private.rb_puede_consultar_unidad(s.unidad_id)
    )
  );

drop policy if exists rb_fotos_insert on public.semoviente_fotografias;
create policy rb_fotos_insert on public.semoviente_fotografias
  for insert to authenticated
  with check (
    private.rb_rol_actual() = 'RESP_UNIDAD'
    and registrado_por = auth.uid()
    and exists (
      select 1 from public.semovientes s
      where s.id = semoviente_id
        and s.unidad_id = private.rb_unidad_actual()
        and s.estado = 'Activo'
        and ruta like (s.unidad_id::text || '/' || s.id::text || '/' || vista || '-%')
    )
  );

-- Sin politicas UPDATE/DELETE: las fotografias asociadas no se pueden sobrescribir
-- ni borrar desde el cliente. Las operaciones futuras requieren auditoria.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'semovientes-fotos', 'semovientes-fotos', false,
  5242880, array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- La ruta es unidad_id/semoviente_id/vista-uuid.ext.
-- La lectura siempre utiliza la unidad ACTUAL del animal, incluso si se traslado.
drop policy if exists rb_semovientes_fotos_lectura on storage.objects;
create policy rb_semovientes_fotos_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'semovientes-fotos'
    and exists (
      select 1 from public.semovientes s
      where s.id::text = split_part(name, '/', 2)
        and private.rb_puede_consultar_unidad(s.unidad_id)
    )
  );

drop policy if exists rb_semovientes_fotos_subida on storage.objects;
create policy rb_semovientes_fotos_subida on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'semovientes-fotos'
    and private.rb_rol_actual() = 'RESP_UNIDAD'
    and name ~ '^[0-9]+/[0-9]+/(frontal|lateral_izquierdo|lateral_derecho)-[0-9a-f-]{36}[.](jpg|png|webp)$'
    and exists (
      select 1 from public.semovientes s
      where s.id::text = split_part(name, '/', 2)
        and s.unidad_id::text = split_part(name, '/', 1)
        and s.unidad_id = private.rb_unidad_actual()
        and s.estado = 'Activo'
    )
  );

-- Barreras restrictivas: impiden que politicas genericas heredadas de Storage
-- concedan acceso adicional a este bucket privado.
drop policy if exists rb_semovientes_fotos_limite_lectura on storage.objects;
create policy rb_semovientes_fotos_limite_lectura on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'semovientes-fotos'
    or exists (
      select 1 from public.semovientes s
      where s.id::text = split_part(name, '/', 2)
        and private.rb_puede_consultar_unidad(s.unidad_id)
    )
  );

drop policy if exists rb_semovientes_fotos_limite_insert on storage.objects;
create policy rb_semovientes_fotos_limite_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'semovientes-fotos'
    or (
      private.rb_rol_actual() = 'RESP_UNIDAD'
      and exists (
        select 1 from public.semovientes s
        where s.id::text = split_part(name, '/', 2)
          and s.unidad_id::text = split_part(name, '/', 1)
          and s.unidad_id = private.rb_unidad_actual()
          and s.estado = 'Activo'
      )
    )
  );

drop policy if exists rb_semovientes_fotos_no_update on storage.objects;
create policy rb_semovientes_fotos_no_update on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'semovientes-fotos');

drop policy if exists rb_semovientes_fotos_no_delete on storage.objects;
create policy rb_semovientes_fotos_no_delete on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'semovientes-fotos');

drop policy if exists rb_semovientes_fotos_no_anon on storage.objects;
create policy rb_semovientes_fotos_no_anon on storage.objects
  as restrictive for select to anon
  using (bucket_id <> 'semovientes-fotos');

commit;

-- CONSULTA NO DESTRUCTIVA para comprobar despues de ejecutar:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='semovientes' and column_name='codigo_activo';
-- select id, public from storage.buckets where id='semovientes-fotos';
-- select tablename, policyname, cmd from pg_policies
-- where (schemaname='public' and tablename='semoviente_fotografias')
--    or (schemaname='storage' and tablename='objects' and policyname like 'rb_semovientes_fotos_%');
