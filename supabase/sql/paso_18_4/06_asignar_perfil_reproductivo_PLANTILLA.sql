-- RIO_BLANCO | PASO 18.4 | 06 - ASIGNACION CONTROLADA DE CUENTA DE PRUEBA
-- PRIMERO: crear una cuenta NUEVA en Authentication > Users manualmente.
-- DESPUES: sustituir CORREO_REPRODUCTIVO_DE_PRUEBA por su correo de prueba.
-- NO ejecutar con el correo de Supervisor, Operador o Sanitario.
-- Esta consulta modifica una sola fila de perfiles y COMMIT la hace permanente.
BEGIN;
DO $$
DECLARE
  v_email text := 'ymq3live@gmail.com';
  v_usuario uuid;
  v_rol bigint;
  v_unidad bigint;
BEGIN
  IF v_email='CORREO_REPRODUCTIVO_DE_PRUEBA' THEN
    RAISE EXCEPTION 'Sustituya el correo de ejemplo antes de ejecutar.';
  END IF;
  SELECT id INTO STRICT v_usuario FROM auth.users WHERE lower(email)=lower(v_email);
  SELECT id INTO STRICT v_rol FROM public.roles_sistema WHERE codigo='REPRODUCTIVO';
  SELECT id INTO STRICT v_unidad FROM public.unidades_operativas WHERE codigo='RIO-BLANCO';
  IF EXISTS (SELECT 1 FROM public.perfiles WHERE id=v_usuario) THEN
    RAISE EXCEPTION 'Esta cuenta ya tiene perfil. No se modifico.';
  END IF;
  INSERT INTO public.perfiles(id,nombre_completo,rol_id,unidad_id,activo)
  VALUES(v_usuario,'Responsable Reproductivo de Prueba',v_rol,v_unidad,true);
  RAISE NOTICE 'Se creo SOLO el perfil REPRODUCTIVO de prueba para RIO-BLANCO.';
END $$;
COMMIT;
-- Para verificar, use una consulta separada y filtre por el correo de la cuenta nueva.
