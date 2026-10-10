# Motor Simulator

Laboratorio interactivo de mecánica de motores. El primer prototipo se centra en un monocilíndrico de cuatro tiempos: animación en corte, régimen, acelerador, carga, telemetría y sonido generado en tiempo real.

## Requisitos
- Node.js 20 o una versión LTS reciente
- npm
- Navegador con Canvas 2D y Web Audio API (Chrome, Edge, Firefox o Safari reciente)

## Ejecutar
1. Clona este repositorio.
2. Instala las dependencias: npm install
3. Inicia el servidor: npm run dev
4. Abre la URL local que indica Vite.
5. Pulsa Activar sonido del motor. El navegador exige una interacción del usuario para reproducir audio.

## Controles
- Arrancar / detener: habilita o detiene el motor.
- Acelerador: modifica la demanda de potencia y el carácter del sonido.
- Carga: introduce una carga simplificada sobre el motor.
- Activar sonido: activa o silencia las capas de audio.

## Sonido
El prototipo genera audio mediante Web Audio API: pulsos temporizados de combustión, resonancia grave de escape, ruido filtrado de admisión, armónicos mecánicos y compresión dinámica. El tono se adapta al régimen y la textura responde al acelerador.

**Limitación honesta:** el sonido es sintetizado, no una grabación real ni una simulación acústica validada. Para lograr una fidelidad mayor, el siguiente paso será incorporar muestras grabadas y licenciadas de motores reales, perfiles configurables de motor y comparar el resultado contra referencias de audio.

## Scripts
- npm run dev: servidor local
- npm run typecheck: validación TypeScript
- npm run build: compilación
- npm run preview: previsualizar el build

## Estructura
- src/simulation/engine.ts: dinámica simplificada, desacoplada de la interfaz.
- src/audio/EngineAudio.ts: síntesis de audio.
- src/components/EngineCanvas.tsx: vista de sección animada.
- src/App.tsx: controles y paneles.
- src/styles.css: diseño adaptable a escritorio y móvil.

## Próximas etapas
1. Validar el sonido con referencias reales y añadir perfiles de motor.
2. Mejorar el modelo de par, fricción, inercia, admisión y escape.
3. Añadir motores con 2, 3, 4 y más cilindros.
4. Añadir pruebas automatizadas para la dinámica y el ciclo.
5. Empaquetar escritorio con Tauri.

Potencia, par y temperatura son estimaciones del modelo de demostración, no resultados de un solver termodinámico ni mediciones de banco.