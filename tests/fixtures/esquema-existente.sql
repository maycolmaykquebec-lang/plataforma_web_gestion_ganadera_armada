-- Fixture local, exclusivamente para pruebas PGlite. No aplicar en Supabase real.
-- Estructura reproducida del diagnóstico; todos los catálogos y usuarios son ficticios.
set timezone='America/La_Paz';
create role anon;
create role authenticated;
create schema auth;
create schema private;
grant usage on schema auth,private to authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant execute on function auth.uid() to authenticated;
create table public.departamentos (
 id bigint generated always as identity not null,
 codigo varchar not null,
 nombre varchar not null,
 descripcion text,
 activo boolean default true not null,
 created_at timestamptz default now()
);
create table public.divisiones (
 id bigint generated always as identity not null,
 departamento_id bigint not null,
 codigo varchar not null,
 nombre varchar not null,
 descripcion text,
 activo boolean default true not null,
 created_at timestamptz default now()
);
create table public.unidades_operativas (
 id bigint generated always as identity not null,
 division_id bigint not null,
 codigo varchar not null,
 sigla varchar not null,
 nombre varchar not null,
 tipo_produccion varchar not null,
 descripcion text,
 activo boolean default true not null,
 created_at timestamptz default now()
);
create table public.roles_sistema (
 id bigint generated always as identity not null,
 codigo varchar not null,
 nombre varchar not null,
 descripcion text,
 created_at timestamptz default now()
);
create table public.perfiles (
 id uuid not null,
 nombre_completo varchar not null,
 cargo varchar,
 rol_id bigint not null,
 departamento_id bigint,
 division_id bigint,
 unidad_id bigint,
 activo boolean default true not null,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);
create function private.rol_actual() returns text language sql stable security definer set search_path='' as $$
 select r.codigo from public.perfiles p join public.roles_sistema r on r.id=p.rol_id where p.id=auth.uid() and p.activo
$$;
create function private.unidad_actual() returns bigint language sql stable security definer set search_path='' as $$
 select p.unidad_id from public.perfiles p where p.id=auth.uid() and p.activo
$$;
grant execute on function private.rol_actual(),private.unidad_actual() to authenticated;
create table public.semovientes (
 id bigint generated always as identity not null,
 unidad_id bigint default private.unidad_actual() not null,
 codigo varchar not null,
 especie varchar not null,
 raza varchar,
 sexo varchar not null,
 fecha_nacimiento date,
 categoria varchar not null,
 procedencia varchar,
 fecha_ingreso date not null,
 marca_ancla boolean default false not null,
 vacuna_brucelosis boolean default false not null,
 estado varchar default 'Activo'::character varying not null,
 observaciones text,
 created_by uuid default auth.uid(),
 created_at timestamptz default now() not null,
 updated_at timestamptz default now() not null
);
create table public.semoviente_eventos (
 id bigint generated always as identity not null,
 semoviente_id bigint not null,
 tipo_evento text not null,
 fecha_evento timestamptz not null,
 titulo varchar not null,
 detalle text,
 origen_modulo text not null,
 origen_registro_id text,
 datos_adicionales jsonb default '{}'::jsonb not null,
 registrado_por uuid default auth.uid() not null,
 registrado_en timestamptz default now() not null
);
create table public.controles_sanitarios (
 id bigint generated always as identity not null,
 semoviente_id bigint not null,
 tipo_control varchar not null,
 fecha_control date not null,
 responsable_sanitario varchar not null,
 motivo text not null,
 diagnostico text,
 producto varchar,
 dosis numeric,
 unidad_dosis varchar,
 via_administracion varchar,
 lote_producto varchar,
 proximo_control date,
 observaciones text,
 registrado_por uuid default auth.uid() not null,
 registrado_en timestamptz default now() not null
);
create table public.controles_reproductivos (
 id bigint generated always as identity not null,
 semoviente_id bigint not null,
 tipo_evento varchar not null,
 fecha_evento date not null,
 responsable_reproductivo varchar not null,
 resultado varchar not null,
 detalle text not null,
 reproductor_codigo varchar,
 metodo varchar,
 fecha_parto_probable date,
 cantidad_crias integer,
 crias_codigos_referencia text,
 cantidad_huevos integer,
 huevos_fertiles integer,
 nacidos_eclosion integer,
 proximo_control date,
 observaciones text,
 registrado_por uuid default auth.uid() not null,
 registrado_en timestamptz default now() not null
);
create table public.reproduccion_crias_vinculadas (
 control_id bigint not null,
 cria_id bigint not null
);
create table public.solicitudes_movimientos (
 id bigint generated always as identity not null,
 semoviente_id bigint not null,
 unidad_origen_id bigint not null,
 unidad_destino_id bigint not null,
 fecha_prevista date not null,
 motivo text not null,
 solicitado_por uuid not null,
 referencia_autorizacion text,
 estado varchar default 'pendiente'::character varying not null,
 autorizado_por uuid,
 fecha_autorizacion timestamptz,
 fecha_ejecucion timestamptz,
 observaciones text,
 creado_en timestamptz default now() not null,
 actualizado_en timestamptz default now() not null,
 fundamento_decision text,
 referencia_decision text,
 ejecutado_por uuid
);
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_0 CHECK (((diagnostico IS NULL) OR (length(diagnostico) <= 2000)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_1 CHECK (((dosis IS NULL) OR (dosis > (0)::numeric)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_2 CHECK ((((dosis IS NULL) AND (unidad_dosis IS NULL)) OR ((dosis IS NOT NULL) AND (unidad_dosis IS NOT NULL))));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_3 CHECK (((length(btrim(motivo)) >= 5) AND (length(btrim(motivo)) <= 2000)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_4 CHECK (((observaciones IS NULL) OR (length(observaciones) <= 2000)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_5 PRIMARY KEY (id);
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_6 CHECK (((producto IS NULL) OR (length(btrim((producto)::text)) > 0)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_7 CHECK ((((tipo_control)::text <> ALL ((ARRAY['Vacunación'::character varying, 'Desparasitación'::character varying, 'Tratamiento'::character varying])::text[])) OR ((producto IS NOT NULL) AND (length(btrim((producto)::text)) > 0))));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_8 CHECK (((proximo_control IS NULL) OR (proximo_control >= fecha_control)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_10 CHECK (((length(btrim((responsable_sanitario)::text)) >= 3) AND (length(btrim((responsable_sanitario)::text)) <= 120)));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_12 CHECK (((tipo_control)::text = ANY ((ARRAY['Vacunación'::character varying, 'Desparasitación'::character varying, 'Diagnóstico'::character varying, 'Tratamiento'::character varying, 'Revisión'::character varying, 'Control preventivo'::character varying])::text[])));
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_13 CHECK (((unidad_dosis IS NULL) OR ((unidad_dosis)::text = ANY ((ARRAY['mL'::character varying, 'mg'::character varying, 'UI'::character varying, 'dosis'::character varying])::text[]))));
alter table public.divisiones add constraint fixture_divisiones_14 UNIQUE (departamento_id, codigo);
alter table public.divisiones add constraint fixture_divisiones_16 PRIMARY KEY (id);
alter table public.unidades_operativas add constraint fixture_unidades_operativas_17 UNIQUE (codigo);
alter table public.unidades_operativas add constraint fixture_unidades_operativas_19 PRIMARY KEY (id);
alter table public.roles_sistema add constraint fixture_roles_sistema_20 UNIQUE (codigo);
alter table public.roles_sistema add constraint fixture_roles_sistema_21 PRIMARY KEY (id);
alter table public.perfiles add constraint fixture_perfiles_25 PRIMARY KEY (id);
alter table public.departamentos add constraint fixture_departamentos_28 UNIQUE (codigo);
alter table public.departamentos add constraint fixture_departamentos_29 PRIMARY KEY (id);
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_30 CHECK ((jsonb_typeof(datos_adicionales) = 'object'::text));
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_31 CHECK ((origen_modulo = ANY (ARRAY['historial'::text, 'registro'::text, 'sanidad'::text, 'reproduccion'::text, 'movimientos'::text, 'altas_bajas'::text, 'descarte'::text])));
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_32 PRIMARY KEY (id);
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_35 CHECK ((tipo_evento = ANY (ARRAY['registro'::text, 'sanitario'::text, 'reproductivo'::text, 'movimiento'::text, 'alta'::text, 'baja'::text, 'descarte'::text, 'observacion'::text])));
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_36 CHECK (((length(btrim((titulo)::text)) >= 3) AND (length(btrim((titulo)::text)) <= 160)));
alter table public.semovientes add constraint fixture_semovientes_37 CHECK ((((especie)::text <> 'bovino'::text) OR ((((categoria)::text = ANY ((ARRAY['Ternero'::character varying, 'Torillo'::character varying, 'Toro'::character varying, 'Novillo'::character varying])::text[])) AND ((sexo)::text = 'Macho'::text)) OR (((categoria)::text = ANY ((ARRAY['Ternera'::character varying, 'Vaquilla'::character varying, 'Vaca'::character varying])::text[])) AND ((sexo)::text = 'Hembra'::text)))));
alter table public.semovientes add constraint fixture_semovientes_38 CHECK ((length(TRIM(BOTH FROM categoria)) > 0));
alter table public.semovientes add constraint fixture_semovientes_39 UNIQUE (unidad_id, codigo);
alter table public.semovientes add constraint fixture_semovientes_41 CHECK (((especie)::text = ANY ((ARRAY['bovino'::character varying, 'equino'::character varying, 'caprino'::character varying, 'mular'::character varying, 'avicola'::character varying, 'porcino'::character varying])::text[])));
alter table public.semovientes add constraint fixture_semovientes_42 CHECK (((estado)::text = ANY ((ARRAY['Activo'::character varying, 'Baja'::character varying])::text[])));
alter table public.semovientes add constraint fixture_semovientes_43 CHECK (((fecha_nacimiento IS NULL) OR (fecha_nacimiento <= fecha_ingreso)));
alter table public.semovientes add constraint fixture_semovientes_44 PRIMARY KEY (id);
alter table public.semovientes add constraint fixture_semovientes_45 CHECK (((sexo)::text = ANY ((ARRAY['Macho'::character varying, 'Hembra'::character varying])::text[])));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_47 PRIMARY KEY (id);
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_50 CHECK (((((tipo_evento)::text = ANY ((ARRAY['parto'::character varying, 'nacimiento'::character varying])::text[])) AND (cantidad_crias IS NOT NULL) AND ((cantidad_crias >= 1) AND (cantidad_crias <= 1000))) OR (((tipo_evento)::text <> ALL ((ARRAY['parto'::character varying, 'nacimiento'::character varying])::text[])) AND (cantidad_crias IS NULL))));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_51 CHECK (((length(btrim(detalle)) >= 5) AND (length(btrim(detalle)) <= 1500)));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_52 CHECK (((fecha_parto_probable IS NULL) OR ((tipo_evento)::text = 'gestacion'::text)));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_53 CHECK ((((fecha_parto_probable IS NULL) OR (fecha_parto_probable >= fecha_evento)) AND ((proximo_control IS NULL) OR (proximo_control >= fecha_evento))));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_54 CHECK ((((huevos_fertiles IS NULL) OR ((huevos_fertiles >= 0) AND (huevos_fertiles <= cantidad_huevos))) AND ((nacidos_eclosion IS NULL) OR ((nacidos_eclosion >= 0) AND (nacidos_eclosion <= cantidad_huevos))) AND ((huevos_fertiles IS NULL) OR (nacidos_eclosion IS NULL) OR (nacidos_eclosion <= huevos_fertiles))));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_55 CHECK (((((tipo_evento)::text = ANY ((ARRAY['postura'::character varying, 'incubacion'::character varying, 'fertilidad'::character varying, 'eclosion'::character varying])::text[])) AND (cantidad_huevos IS NOT NULL) AND ((cantidad_huevos >= 1) AND (cantidad_huevos <= 1000000))) OR (((tipo_evento)::text <> ALL ((ARRAY['postura'::character varying, 'incubacion'::character varying, 'fertilidad'::character varying, 'eclosion'::character varying])::text[])) AND (cantidad_huevos IS NULL) AND (huevos_fertiles IS NULL) AND (nacidos_eclosion IS NULL))));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_56 CHECK (((observaciones IS NULL) OR (length(observaciones) <= 1500)));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_57 CHECK (((reproductor_codigo IS NULL) OR ((length(btrim((reproductor_codigo)::text)) >= 1) AND (length(btrim((reproductor_codigo)::text)) <= 80))));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_58 CHECK (((length(btrim((responsable_reproductivo)::text)) >= 3) AND (length(btrim((responsable_reproductivo)::text)) <= 120)));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_59 CHECK (((length(btrim((resultado)::text)) >= 3) AND (length(btrim((resultado)::text)) <= 200)));
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_60 CHECK (((tipo_evento)::text = ANY ((ARRAY['monta'::character varying, 'inseminacion'::character varying, 'gestacion'::character varying, 'parto'::character varying, 'nacimiento'::character varying, 'evaluacion'::character varying, 'seguimiento'::character varying, 'postura'::character varying, 'incubacion'::character varying, 'fertilidad'::character varying, 'eclosion'::character varying])::text[])));
alter table public.reproduccion_crias_vinculadas add constraint fixture_reproduccion_crias_vinculadas_63 UNIQUE (cria_id);
alter table public.reproduccion_crias_vinculadas add constraint fixture_reproduccion_crias_vinculadas_64 PRIMARY KEY (control_id, cria_id);
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_65 CHECK ((((estado)::text <> ALL ((ARRAY['aprobado'::character varying, 'ejecutado'::character varying, 'rechazado'::character varying])::text[])) OR ((autorizado_por IS NOT NULL) AND (fecha_autorizacion IS NOT NULL))));
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_66 CHECK ((((estado)::text <> 'ejecutado'::text) OR (fecha_ejecucion IS NOT NULL)));
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_67 CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'aprobado'::character varying, 'rechazado'::character varying, 'ejecutado'::character varying, 'cancelado'::character varying])::text[])));
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_68 CHECK ((length(btrim(motivo)) >= 10));
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_69 CHECK (((autorizado_por IS NULL) OR (autorizado_por <> solicitado_por)));
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_70 CHECK ((unidad_origen_id <> unidad_destino_id));
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_73 PRIMARY KEY (id);

alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_9 FOREIGN KEY (registrado_por) REFERENCES auth.users(id);
alter table public.controles_sanitarios add constraint fixture_controles_sanitarios_11 FOREIGN KEY (semoviente_id) REFERENCES semovientes(id) ON DELETE RESTRICT;
alter table public.divisiones add constraint fixture_divisiones_15 FOREIGN KEY (departamento_id) REFERENCES departamentos(id);
alter table public.unidades_operativas add constraint fixture_unidades_operativas_18 FOREIGN KEY (division_id) REFERENCES divisiones(id);
alter table public.perfiles add constraint fixture_perfiles_22 FOREIGN KEY (departamento_id) REFERENCES departamentos(id);
alter table public.perfiles add constraint fixture_perfiles_23 FOREIGN KEY (division_id) REFERENCES divisiones(id);
alter table public.perfiles add constraint fixture_perfiles_24 FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.perfiles add constraint fixture_perfiles_26 FOREIGN KEY (rol_id) REFERENCES roles_sistema(id);
alter table public.perfiles add constraint fixture_perfiles_27 FOREIGN KEY (unidad_id) REFERENCES unidades_operativas(id);
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_33 FOREIGN KEY (registrado_por) REFERENCES auth.users(id);
alter table public.semoviente_eventos add constraint fixture_semoviente_eventos_34 FOREIGN KEY (semoviente_id) REFERENCES semovientes(id) ON DELETE RESTRICT;
alter table public.semovientes add constraint fixture_semovientes_40 FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.semovientes add constraint fixture_semovientes_46 FOREIGN KEY (unidad_id) REFERENCES unidades_operativas(id);
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_48 FOREIGN KEY (registrado_por) REFERENCES auth.users(id);
alter table public.controles_reproductivos add constraint fixture_controles_reproductivos_49 FOREIGN KEY (semoviente_id) REFERENCES semovientes(id) ON DELETE RESTRICT;
alter table public.reproduccion_crias_vinculadas add constraint fixture_reproduccion_crias_vinculadas_61 FOREIGN KEY (control_id) REFERENCES controles_reproductivos(id) ON DELETE RESTRICT;
alter table public.reproduccion_crias_vinculadas add constraint fixture_reproduccion_crias_vinculadas_62 FOREIGN KEY (cria_id) REFERENCES semovientes(id) ON DELETE RESTRICT;
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_71 FOREIGN KEY (autorizado_por) REFERENCES auth.users(id);
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_72 FOREIGN KEY (ejecutado_por) REFERENCES auth.users(id);
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_74 FOREIGN KEY (semoviente_id) REFERENCES semovientes(id);
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_75 FOREIGN KEY (solicitado_por) REFERENCES auth.users(id);
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_76 FOREIGN KEY (unidad_destino_id) REFERENCES unidades_operativas(id);
alter table public.solicitudes_movimientos add constraint fixture_solicitudes_movimientos_77 FOREIGN KEY (unidad_origen_id) REFERENCES unidades_operativas(id);

-- El diagnóstico muestra una historia por animal; preservar la identidad de origen.
create unique index fixture_evento_origen on public.semoviente_eventos(origen_modulo,origen_registro_id) where origen_registro_id is not null;
alter table public.departamentos enable row level security;
revoke all on public.departamentos from public,anon,authenticated;
grant select on public.departamentos to authenticated;
alter table public.divisiones enable row level security;
revoke all on public.divisiones from public,anon,authenticated;
grant select on public.divisiones to authenticated;
alter table public.unidades_operativas enable row level security;
revoke all on public.unidades_operativas from public,anon,authenticated;
grant select on public.unidades_operativas to authenticated;
alter table public.roles_sistema enable row level security;
revoke all on public.roles_sistema from public,anon,authenticated;
grant select on public.roles_sistema to authenticated;
alter table public.perfiles enable row level security;
revoke all on public.perfiles from public,anon,authenticated;
grant select on public.perfiles to authenticated;
alter table public.semovientes enable row level security;
revoke all on public.semovientes from public,anon,authenticated;
grant select on public.semovientes to authenticated;
alter table public.semoviente_eventos enable row level security;
revoke all on public.semoviente_eventos from public,anon,authenticated;
grant select on public.semoviente_eventos to authenticated;
alter table public.controles_sanitarios enable row level security;
revoke all on public.controles_sanitarios from public,anon,authenticated;
grant select on public.controles_sanitarios to authenticated;
alter table public.controles_reproductivos enable row level security;
revoke all on public.controles_reproductivos from public,anon,authenticated;
grant select on public.controles_reproductivos to authenticated;
alter table public.reproduccion_crias_vinculadas enable row level security;
revoke all on public.reproduccion_crias_vinculadas from public,anon,authenticated;
grant select on public.reproduccion_crias_vinculadas to authenticated;
alter table public.solicitudes_movimientos enable row level security;
revoke all on public.solicitudes_movimientos from public,anon,authenticated;
grant select on public.solicitudes_movimientos to authenticated;
create policy controles_sanitarios_insert_sanitario_unidad on public.controles_sanitarios for INSERT to authenticated with check(((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT private.rol_actual() AS rol_actual) = 'SANITARIO'::text) AND (( SELECT private.unidad_actual() AS unidad_actual) IS NOT NULL) AND (registrado_por = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM semovientes s
  WHERE ((s.id = controles_sanitarios.semoviente_id) AND (s.unidad_id = ( SELECT private.unidad_actual() AS unidad_actual)) AND ((s.estado)::text = 'Activo'::text))))));
create policy controles_sanitarios_lectura_por_animal on public.controles_sanitarios for SELECT to authenticated using((EXISTS ( SELECT 1
   FROM semovientes s
  WHERE (s.id = controles_sanitarios.semoviente_id))));
create policy divisiones_lectura on public.divisiones for SELECT to authenticated using((( SELECT private.rol_actual() AS rol_actual) IS NOT NULL));
create policy unidades_lectura on public.unidades_operativas for SELECT to authenticated using((( SELECT private.rol_actual() AS rol_actual) IS NOT NULL));
create policy roles_lectura on public.roles_sistema for SELECT to authenticated using((( SELECT private.rol_actual() AS rol_actual) IS NOT NULL));
create policy perfil_propio_lectura on public.perfiles for SELECT to authenticated using((id = ( SELECT auth.uid() AS uid)));
create policy departamentos_lectura on public.departamentos for SELECT to authenticated using((( SELECT private.rol_actual() AS rol_actual) IS NOT NULL));
create policy semoviente_eventos_lectura_por_animal on public.semoviente_eventos for SELECT to authenticated using((EXISTS ( SELECT 1
   FROM semovientes s
  WHERE (s.id = semoviente_eventos.semoviente_id))));
create policy semovientes_insert_operador_unidad on public.semovientes for INSERT to authenticated with check(((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT private.rol_actual() AS rol_actual) = 'OPERADOR'::text) AND (unidad_id = ( SELECT private.unidad_actual() AS unidad_actual)) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((estado)::text = 'Activo'::text)));
create policy semovientes_lectura_institucional on public.semovientes for SELECT to authenticated using(((( SELECT private.rol_actual() AS rol_actual) = ANY (ARRAY['SUP_DEPTO_VII'::text, 'JEFE_DIV_B'::text, 'ADMIN_DIV_B'::text])) OR ((( SELECT private.rol_actual() AS rol_actual) = ANY (ARRAY['RESP_UNIDAD'::text, 'OPERADOR'::text, 'SANITARIO'::text, 'CONSULTA'::text])) AND (unidad_id = ( SELECT private.unidad_actual() AS unidad_actual)))));
create policy semovientes_lectura_reproductivo_unidad on public.semovientes for SELECT to authenticated using(((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT private.rol_actual() AS rol_actual) = 'REPRODUCTIVO'::text) AND (unidad_id = ( SELECT private.unidad_actual() AS unidad_actual))));
create policy controles_reproductivos_insert_responsable_unidad on public.controles_reproductivos for INSERT to authenticated with check(((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT private.rol_actual() AS rol_actual) = 'REPRODUCTIVO'::text) AND (( SELECT private.unidad_actual() AS unidad_actual) IS NOT NULL) AND (registrado_por = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM semovientes s
  WHERE ((s.id = controles_reproductivos.semoviente_id) AND (s.unidad_id = ( SELECT private.unidad_actual() AS unidad_actual)) AND ((s.estado)::text = 'Activo'::text))))));
create policy controles_reproductivos_lectura_por_animal on public.controles_reproductivos for SELECT to authenticated using((EXISTS ( SELECT 1
   FROM semovientes s
  WHERE (s.id = controles_reproductivos.semoviente_id))));
create policy reproduccion_crias_lectura_por_madre on public.reproduccion_crias_vinculadas for SELECT to authenticated using((EXISTS ( SELECT 1
   FROM (controles_reproductivos r
     JOIN semovientes c ON ((c.id = reproduccion_crias_vinculadas.cria_id)))
  WHERE (r.id = reproduccion_crias_vinculadas.control_id))));

-- Una política de lectura permisiva heredada representa la combinación OR que
-- la nueva barrera restrictiva debe limitar sin eliminar esa política.
create policy fixture_lectura_heredada_amplia on public.semovientes for select to authenticated using (private.rol_actual() is not null);
insert into public.departamentos(codigo,nombre) values('DPTO-VII','Departamento ficticio VII'),('OTRO','Departamento de prueba ajeno');
insert into public.divisiones(departamento_id,codigo,nombre) values(1,'B','División ficticia B'),(2,'OTRA','División ajena');
insert into public.unidades_operativas(division_id,codigo,sigla,nombre,tipo_produccion) values
 (1,'MAMORE','UOSPGP.','MAMORE','ganadera'),(1,'TAMARINERO','UOSPG.','TAMARINERO','ganadera'),(1,'RIO-BLANCO','UOSPG.','RÍO BLANCO','ganadera');
insert into public.roles_sistema(codigo,nombre) values
 ('SUP_DEPTO_VII','Supervisor ficticio'),('JEFE_DIV_B','Jefe ficticio'),('ADMIN_DIV_B','Administrador heredado'),('RESP_UNIDAD','Responsable ficticio'),('OPERADOR','Operador heredado'),('SANITARIO','Sanitario heredado'),('CONSULTA','Consulta heredada'),('ADMIN_TECNICO','Técnico heredado'),('REPRODUCTIVO','Reproductivo heredado');

-- Triggers heredados observados: fecha válida y marca de actualización.
-- Esta reproducción local no añade triggers sobre solicitudes_movimientos.
create function public.actualizar_updated_at() returns trigger
language plpgsql set search_path='' as $$
begin
 new.updated_at = now();
 return new;
end $$;
create function private.validar_fechas_semoviente() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.fecha_ingreso > current_date or new.fecha_nacimiento > current_date then
  raise exception 'No se admiten fechas futuras' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.actualizar_updated_at(), private.validar_fechas_semoviente()
 from public,anon,authenticated;
create trigger fixture_actualizar_updated_at before update on public.semovientes
 for each row execute function public.actualizar_updated_at();
create trigger fixture_validar_fechas_semoviente before insert or update on public.semovientes
 for each row execute function private.validar_fechas_semoviente();

-- RPC ficticias: reproducen ÚNICAMENTE firmas y permisos, no el código real.
-- Retornos escalares inocuos permiten comprobar que 00 retira la ejecución
-- sin borrar las funciones ni impedir que el propietario las inspeccione.
create function public.sigha_20316_solicitar_traslado(bigint,bigint,date,text,text,text)
 returns bigint language sql security definer set search_path='' as $$ select 20316::bigint $$;
create function public.sigha_20320_decidir_traslado(bigint,text,text,text)
 returns text language sql security definer set search_path='' as $$ select 'fixture_decision'::text $$;
create function public.sigha_20321_listar_pendientes()
 returns jsonb language sql security definer set search_path='' as $$ select '[]'::jsonb $$;
create function public.sigha_20421_ejecutar_traslado(bigint)
 returns bigint language sql security definer set search_path='' as $$ select 20421::bigint $$;
create function public.sigha_20423_listar_aprobados()
 returns jsonb language sql security definer set search_path='' as $$ select '[]'::jsonb $$;
grant execute on function
 public.sigha_20316_solicitar_traslado(bigint,bigint,date,text,text,text),
 public.sigha_20320_decidir_traslado(bigint,text,text,text),
 public.sigha_20321_listar_pendientes(),
 public.sigha_20423_listar_aprobados()
 to public,authenticated;
revoke all on function public.sigha_20421_ejecutar_traslado(bigint)
 from public,anon,authenticated;
