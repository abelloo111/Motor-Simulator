# Motor Simulator

Laboratorio interactivo de motores de combustión con animación mecánica, parámetros configurables, telemetría y caja manual simplificada. La versión actual es un prototipo educativo: permite experimentar con varias configuraciones, pero no sustituye un solver termodinámico ni una simulación de vehículo validada.

## Requisitos
- Node.js 20 o una versión LTS reciente
- npm
- Navegador con Canvas 2D y Web Audio API (Chrome, Edge, Firefox o Safari reciente)

## Ejecutar en local o Codespaces
1. Abre el repositorio en VS Code o GitHub Codespaces.
2. Ejecuta \`npm install\`.
3. Ejecuta \`npm run dev -- --host 0.0.0.0\` en Codespaces (en local también funciona \`npm run dev\`).
4. Abre la URL que indica Vite o el puerto 5173 reenviado por Codespaces.
5. Pulsa **Activar sonido del motor**. El navegador exige una interacción del usuario para reproducir audio.

## Controles de simulación
- **Arrancar / detener:** activa o apaga el motor.
- **Acelerador:** aumenta la demanda de régimen y par.
- **Carga del motor:** representa una carga simplificada.
- **Embrague:** 0 % es pedal pisado; 100 % es embrague acoplado.
- **Marcha − / +:** selecciona reversa, punto muerto y las marchas hacia delante. Pisa el embrague antes de cambiar.
- **Audio:** silencia o reanuda las capas de síntesis.

## Configuración del motor
Abre el botón de ajustes de la parte superior. Se pueden modificar:
- Entre 1 y 12 cilindros y disposición en línea, V o bóxer.
- Diámetro y carrera; la cilindrada se calcula automáticamente.
- Relación de compresión, régimen de ralentí y límite de RPM.
- Orden de encendido, con una secuencia válida que use cada cilindro una sola vez.

Los patrones iniciales de orden de encendido sirven para experimentar; no deben interpretarse como datos correctos para cualquier motor comercial. La vista mecánica muestra un esquema de ciclo y pistones animados, no la geometría exacta de cada cigüeñal ni de todos los diseños V o bóxer.

## Transmisión
El usuario puede configurar de 2 a 8 relaciones de marcha, la relación final, masa del vehículo y radio de rueda. El modelo calcula una velocidad ilustrativa y acopla las RPM al movimiento a través de las relaciones seleccionadas. La adherencia de neumáticos, las relaciones de diferencial reales, los cambios de marcha y la dinámica del embrague aún están simplificados.

## Sonido
El audio se genera mediante Web Audio API. Los impulsos siguen la frecuencia de encendido de un motor de cuatro tiempos y responden al número de cilindros, la disposición seleccionada, las RPM, el acelerador y la carga. También hay capas sintetizadas de escape, admisión y vibración mecánica.

**Limitación:** no son grabaciones reales y el modelo acústico no está validado contra motores medidos. El objetivo de esta versión es que los cambios de configuración se reflejen de forma coherente en la respuesta y el timbre básico; la incorporación de muestras reales licenciadas y la comparación con referencias siguen siendo trabajo futuro.

## Scripts
- \`npm run dev\`: servidor de desarrollo
- \`npm run typecheck\`: validación TypeScript
- \`npm run build\`: validación TypeScript y compilación Vite
- \`npm run preview\`: previsualizar el build

## Estructura
- \`src/simulation/engine.ts\`: parámetros del motor, dinámica simplificada, cilindrada y transmisión.
- \`src/audio/EngineAudio.ts\`: síntesis de pulsos de combustión y capas de audio.
- \`src/components/EngineCanvas.tsx\`: esquema mecánico animado configurable.
- \`src/App.tsx\`: panel de configuración, controles y telemetría.
- \`src/styles.css\`: diseño adaptable a escritorio y móvil.

## Próximas etapas
1. Validar las curvas de par, potencia y RPM frente a datos de referencia.
2. Refinar geometría del cigüeñal, distribución y secuencias de encendido según arquitectura.
3. Mejorar el audio con grabaciones de motor con licencia y mezcla dinámica.
4. Añadir pruebas automatizadas para dinámica del motor, caja y límites de configuración.
5. Empaquetar como aplicación de escritorio con Tauri.

Potencia, par, temperatura y velocidad son estimaciones del prototipo, no mediciones reales ni resultados de un modelo físico validado.
