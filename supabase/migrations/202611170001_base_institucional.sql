-- Instalación NUEVA en un proyecto Supabase vacío; no aplicar sobre tablas heredadas.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.roles_sistema (
 id bigint generated always as identity primary key,
 codigo text not null unique check (codigo in ('SUP_DEPTO_VII','JEFE_DIV_B','RESP_UNIDAD')),
 nombre text not null
);
insert into public.roles_sistema(codigo,nombre) values
 ('SUP_DEPTO_VII','Supervisor Departamento VII'),('JEFE_DIV_B','Jefe División B'),('RESP_UNIDAD','Responsable de unidad');
create table public.departamentos (id bigint generated always as identity primary key, nombre text not null);
insert into public.departamentos(nombre) values ('DPTO. VII «PARTICIPACIÓN EN EL DESARROLLO» · DIV. «B» «PRODUCCIÓN»');
create table public.unidades_operativas (
 id bigint generated always as identity primary key,
 codigo text not null unique check(codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')),
 nombre text not null, sigla text not null,
 departamento_id bigint not null references public.departamentos(id)
);
insert into public.unidades_operativas(codigo,nombre,sigla,departamento_id)
 select v.*,d.id from public.departamentos d cross join (values
 ('RIO-BLANCO','RÍO BLANCO','UOSPG.'),('TAMARINERO','TAMARINERO','UOSPG.'),('MAMORE','MAMORE','UOSPGP.')) v(codigo,nombre,sigla);
create table public.perfiles (
 id uuid primary key references auth.users(id), nombre_completo text not null, cargo text,
 activo boolean not null default false,
 rol_id bigint not null references public.roles_sistema(id),
 unidad_id bigint references public.unidades_operativas(id),
 departamento_id bigint not null references public.departamentos(id)
);
-- No se crean perfiles desde metadatos de registro ni se permite autoasignar roles.
create function private.rol_actual() returns text language sql stable security definer set search_path='' as $$
 select r.codigo from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.id=auth.uid() and p.activo and (r.codigo <> 'RESP_UNIDAD' or p.unidad_id is not null)
$$;
create function private.unidad_actual() returns bigint language sql stable security definer set search_path='' as $$
 select p.unidad_id from public.perfiles p where p.id=auth.uid() and p.activo
$$;
revoke all on function private.rol_actual(), private.unidad_actual() from public, anon;
grant execute on function private.rol_actual(), private.unidad_actual() to authenticated;
create function private.validar_perfil() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select codigo from public.roles_sistema where id=new.rol_id)='RESP_UNIDAD' and new.unidad_id is null then
  raise exception 'El responsable requiere una unidad asignada' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.validar_perfil() from public, anon, authenticated;
create trigger validar_perfil before insert or update on public.perfiles for each row execute function private.validar_perfil();
create table public.semovientes (
 id bigint generated always as identity primary key,
 codigo text not null check(length(btrim(codigo)) between 1 and 80),
 unidad_id bigint not null default private.unidad_actual() references public.unidades_operativas(id),
 especie text not null check(especie in ('bovino','equino','caprino','mular','avicola','porcino')),
 categoria text not null, sexo text not null check(sexo in ('Macho','Hembra')),
 raza text, fecha_nacimiento date, fecha_ingreso date not null,
 procedencia text, marca_ancla boolean not null default false, vacuna_brucelosis boolean not null default false,
 estado text not null default 'Activo' check(estado in ('Activo','Baja')),
 observaciones text, registrado_por uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(codigo), check(fecha_nacimiento is null or fecha_nacimiento<=fecha_ingreso)
);
create index semovientes_unidad_idx on public.semovientes(unidad_id);
create function private.validar_semoviente() returns trigger language plpgsql set search_path='' as $$
begin
 if new.fecha_ingreso > (current_timestamp at time zone 'America/La_Paz')::date or new.fecha_nacimiento > (current_timestamp at time zone 'America/La_Paz')::date then
  raise exception 'No se admiten fechas futuras' using errcode='23514';
 end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function private.validar_semoviente() from public,anon,authenticated;
create trigger validar_semoviente before insert or update on public.semovientes for each row execute function private.validar_semoviente();
alter table public.roles_sistema enable row level security;
alter table public.departamentos enable row level security;
alter table public.unidades_operativas enable row level security;
alter table public.perfiles enable row level security;
alter table public.semovientes enable row level security;
revoke all on public.roles_sistema,public.departamentos,public.unidades_operativas,public.perfiles,public.semovientes from public,anon,authenticated;
grant select on public.roles_sistema,public.departamentos,public.unidades_operativas,public.perfiles,public.semovientes to authenticated;
create policy perfil_propio on public.perfiles for select to authenticated using(id=auth.uid());
create policy roles_lectura on public.roles_sistema for select to authenticated using(private.rol_actual() is not null);
create policy departamentos_lectura on public.departamentos for select to authenticated using(private.rol_actual() is not null);
-- El catálogo de destinos es visible para solicitar traslados; los animales siguen limitados por unidad.
create policy unidades_lectura on public.unidades_operativas for select to authenticated using(private.rol_actual() is not null);
create policy semovientes_lectura on public.semovientes for select to authenticated using (
 private.rol_actual() in ('SUP_DEPTO_VII','JEFE_DIV_B') or
 (private.rol_actual()='RESP_UNIDAD' and unidad_id=private.unidad_actual())
);
grant insert(codigo,especie,categoria,sexo,raza,fecha_nacimiento,fecha_ingreso,procedencia,marca_ancla,vacuna_brucelosis,observaciones) on public.semovientes to authenticated;
create policy semovientes_registro on public.semovientes for insert to authenticated with check (
 private.rol_actual()='RESP_UNIDAD' and unidad_id=private.unidad_actual() and registrado_por=auth.uid() and estado='Activo'
);
commit;
