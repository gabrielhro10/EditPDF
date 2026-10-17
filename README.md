# EditPDF

Aplicación web estática para editar PDF directamente en el navegador, pensada para iPad y también para móvil y escritorio. Se instala como app (PWA) y funciona sin conexión después de la primera visita.

Los archivos se procesan en tu dispositivo: no se suben a ningún servidor.

## Qué hace

- **Unir y ordenar:** carga varios PDF, reordena las páginas arrastrándolas y elimínalas o gíralas.
- **Dividir y extraer:** por rangos (`1-3, 5, 7-9`), cada N páginas o una página por archivo; los resultados múltiples se descargan en un `.zip`.
- **Recortar:** márgenes por porcentaje, en una página o en varias. Se guarda como recuadro de recorte, así que el contenido no se borra.
- **Marca de agua y números de página:** con vista previa sobre las miniaturas.
- **Anotar** (un solo botón en el panel):
  - Contenido: texto, dibujo a mano alzada (Apple Pencil, ratón o dedo), formas rellenas sin contorno (rectángulo, óvalo y triángulo), firma reutilizable e imágenes del dispositivo.
  - Color: diez colores y un selector de color libre. El color y el tamaño también se aplican a la anotación seleccionada.
  - Mover y editar: con **Seleccionar**, o con doble toque o doble clic desde cualquier herramienta, la anotación se arrastra para moverla. En un texto, el doble toque abre su edición.
  - Tamaño: el círculo de la esquina lo cambia. Las formas cambian ancho y alto por separado; el resto, de forma proporcional.
- **Comprimir** en tres niveles. Ninguno toca el texto ni los dibujos vectoriales: siguen nítidos y seleccionables.

  | Nivel | Qué hace |
  |---|---|
  | Sin pérdida | Quita miniaturas y datos de edición ocultos, une imágenes y fuentes repetidas y descarta objetos sin uso. Calidad idéntica. |
  | Recomendada | Además, reduce a 200 ppp las fotos y escaneos que pasan de esa resolución y recodifica al 85 % las que vienen casi sin comprimir. Las imágenes que ya están bien no se tocan. |
  | Máxima | Igual, con imágenes a 120 ppp y calidad 72 %. Las fotos se suavizan algo. |

- **Exportar** conservando el PDF original: texto seleccionable, vectores y enlaces. Puedes exportar todo o solo la selección.
- **Deshacer y rehacer**, y recuperación del trabajo si la app se cierra. La sesión se guarda en el dispositivo.

## Uso

Abre la página publicada en <https://gabrielhro10.github.io/EditPDF/>.

Para probarla en local hace falta un servidor, porque el service worker no funciona abriendo `index.html` como archivo. Por ejemplo:

```
python -m http.server 8000
```

y luego abre <http://localhost:8000>.

En iPad horizontal y en escritorio las herramientas del documento están en el panel izquierdo. Ese panel se contrae a una columna de iconos tocando el logo. Al seleccionar páginas, la fila de vista se convierte en la barra de acciones: girar, extraer, recortar y eliminar. Esas acciones solo aparecen ahí, no se repiten en el panel.

En iPad vertical las herramientas pasan a una hoja inferior. En el móvil hay pestañas abajo y una barra flotante con las acciones de la selección.

En el editor de página, el Apple Pencil dibuja y los dedos desplazan y hacen zoom. El interruptor **Dibujar con el dedo** permite dibujar sin lápiz.

### Atajos de teclado

| Atajo | Acción |
|---|---|
| ⌘/Ctrl + O | Abrir PDF |
| ⌘/Ctrl + S | Exportar |
| ⌘/Ctrl + Z, ⇧⌘/Ctrl + Z | Deshacer, rehacer |
| ⌘/Ctrl + A | Seleccionar todas las páginas |
| Supr / ⌫ | Eliminar las páginas seleccionadas, o la anotación seleccionada en el editor |
| Esc | Cerrar el diálogo o el editor, o quitar la selección |

## Instalar como app (PWA)

| Dispositivo | Cómo |
|---|---|
| iPad / iPhone (Safari) | **Compartir → Añadir a pantalla de inicio** |
| Android, Chrome, Edge | Botón **Instalar** en *Acerca de* (al pie del panel de herramientas) o el icono de instalar de la barra de direcciones |

Instalada, abre en pantalla completa con su propio icono. En iOS, además, Safari no borra los datos de las apps de la pantalla de inicio por falta de uso.

En Chrome y Edge de escritorio, la app instalada puede abrir PDF directamente desde el sistema.

## Sin conexión

Un service worker ([sw.js](sw.js)) guarda la app y las librerías la primera vez. Después se puede abrir y usar sin internet.

Al publicar cambios en cualquier archivo de la app, sube `SHELL_VERSION` en [sw.js](sw.js). Si cambias la versión de una librería, actualiza su URL en `index.html`, en `LIB_URLS` de `sw.js` y, para pdf.js, en `PDFJS_WORKER` de `js/pdfio.js`.

## Estructura

```
index.html            estructura de la app y etiquetas PWA / iOS
manifest.webmanifest  datos de instalación
sw.js                 service worker (sin conexión)
css/app.css           estilos
js/core.js            estado, deshacer/rehacer y sesión guardada (IndexedDB)
js/pdfio.js           lectura de PDF y miniaturas (PDF.js)
js/export.js          generación del PDF (pdf-lib), dividir y entregar
js/compress.js        niveles de compresión
js/dialogs.js         diálogos de herramientas
js/editor.js          editor de anotaciones
js/app.js             interfaz y arranque
icons/                iconos de la app
```

## Limitaciones conocidas

- Los PDF protegidos con contraseña de apertura no se pueden abrir: quita la contraseña antes de cargarlos.
- Algunos PDF tienen restricciones del propietario sin contraseña de apertura. Sus páginas se exportan como imagen.
- La compresión solo reduce imágenes JPEG (fotos y escaneos). Las capturas de pantalla y los gráficos guardados sin pérdida no se recomprimen, para no volverlos borrosos.
- Las anotaciones de texto usan Helvetica. Los caracteres fuera del alfabeto latino, como los emoji, se insertan como imagen.

## Créditos

Este proyecto usa las siguientes librerías de código abierto, cargadas desde CDN:

| Librería | Uso | Licencia |
|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) (Mozilla) | Lectura y dibujo de PDF | [Apache 2.0](https://github.com/mozilla/pdf.js/blob/master/LICENSE) |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | Creación y edición de PDF | [MIT](https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md) |
| [JSZip](https://github.com/Stuk/jszip) | Archivos .zip | [MIT o GPLv3](https://github.com/Stuk/jszip/blob/main/LICENSE.markdown) |
| [SortableJS](https://github.com/SortableJS/Sortable) | Reordenar con tacto y ratón | [MIT](https://github.com/SortableJS/Sortable/blob/master/LICENSE) |

## Licencia

El código propio de este proyecto se distribuye bajo la licencia MIT; ver [LICENSE](LICENSE).
