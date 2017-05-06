
# Ayuda para la extensión Multi Traductor

### ¡IMPORTANTE!
Jamás borrar ninguno de los archivos encontrados dentro de la carpeta de este xlet. Podría romper la funcionalidad del xlet.

***

<h2 style="color:red;">Reportes de fallos, peticiones de características y contribuciones</h2>
<span style="color:red;">
Si cualquiera tiene fallos que reportar, peticiones de características y contribuciones, deben realizarlas <a href="https://github.com/Odyseus/CinnamonTools">en la página de GitHub de este xlet</a>.
</span>

***

### Dependencias

**Si una o más de estas dependencias faltan en su sistema, no podrá utilizar esta extensión.**

- Comando **xsel**: XSel es un programa de la consola para obtener y asignar los contenidos de una selección en X.
    - Distribuciones basadas en Debian y Archlinux: El paquete es llamado **xsel**.
- Comando **trans**: Comando proporcionado por **translate-shell**. Es una simple interfaz de línea de comandos para varios proveedores de traducción (Google Translate, Yandex Translate, Bing Translate and Apertium) que permite traducir cadenas de text desde la terminal.
    - Comprobar [dependencias](https://github.com/soimort/translate-shell#dependencies) y [dependencias recomendadas](https://github.com/soimort/translate-shell#recommended-dependencies) de translate-shell.

**Nota:** El paquete **translate-shell** disponible en los repositorios de Ubuntu 16.04.x/Linux Mint 18.x es anticuado y roto. Puede ser instalado de todas maneras así también se instalan sus dependencias. Pero actualizar el script a su última versión debe hacerse como se describe a continuación.

### Cçomo instalar la última versión de translate-shell

#### Opción 1. Descarga directa

Este método sólo instalará el script **trans** en la ubicación especificada.

Sólo para el usuario actual. **~/.local/bin** necesita estar en su PATH.

```shell
$ wget -O ~/.local/bin/trans git.io/trans && chmod ugo+rx ~/.local/bin/trans
```

Para todos los usuarios sin sobre-escribir la versión instalada.

```shell
$ sudo wget -O /usr/local/bin/trans git.io/trans && sudo chmod ugo+rx /usr/local/bin/trans
```

#### Opción 2. Desde Git - [Más detalles](https://github.com/soimort/translate-shell/blob/develop/README.md#option-3-from-git-recommended-for-seasoned-hackers)

Este método no sólo instalará el script **trans**, sino también sus páginas man. Consultar el enlace anterior para obtener más detalles sobre la instalación.

```shell
$ git clone https://github.com/soimort/translate-shell
$ cd translate-shell
$ make
$ sudo make install
```

***

### Uso de la extensión

Una vez instalada y activada, los siguientes atajos de teclado estarán disponibles.

#### Atajos globales (Configurable desde las preferencias de la extensión)

- **<kbd>Súper</kbd> + <kbd>T</kbd>:** Abre el diálogo de traducción
- **<kbd>Súper</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>:** Abre el diálogo de traducción y traduce el texto desde el porta papeles.
- **<kbd>Súper</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd>:** Abre el diálogo de traducción y traduce el texto desde la selección primaria.

#### Atajos disponibles en el diálogo de traducción

- **<kbd>Ctrl</kbd> + <kbd>Enter</kbd>:** Traduce el texto.
- **<kbd>Shift</kbd> + <kbd>Enter</kbd>:** Fuerza la traducción de texto. Ignora el historial de traducción.
- **<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>:** Copia el texto traducido al porta papeles.
- **<kbd>Ctrl</kbd> + <kbd>S</kbd>:** Cambia idiomas.
- **<kbd>Ctrl</kbd> + <kbd>D</kbd>:** Restablece los idiomas predeterminados.
- **<kbd>Escape</kbd>:** Cierra el diálogo.

***

### Ventana de preferencias de la extensión

Desde la ventana de preferencias de la extensión, todas las opciones pueden ser importadas, exportadas y/o restablecidas a sus valores por defecto.

- Para poder realizar cualquiera de estas tareas, el esquema de las preferencias necesita estar instalado en el sistema. Esto es realizado automáticamente cuando la extensión es instalada desde el administrador de extensiones de Cinnamon. Pero si la extensión fue instalada manualmente, el esquema de las preferencias necesita ser instalado manualmente. Esto se logra simplemente con ir a la carpeta de la extensión y ejecutar el siguiente comando:
    - Comando para instalar el esquema de preferencias: `./settings.py install-schema`
    - Comando para desinstalar el esquema de preferencias: `./settings.py remove-schema`
- Para importar/exportar preferencias, el comando **dconf** necesita estar disponible en el sistema.

***

### Localización de applets/desklets/extensiones (también conocidos como xlets)

- Si este xlet se instaló desde Configuración de Cinnamon, todas las localizaciones de este xlet se instalaron automáticamente.
- Si este xlet se instaló manualmente y no a través de Configuración de Cinnamon, las localizaciones se pueden instalar ejecutando el archivo llamado **localizations.sh** desde una terminal abierta dentro de la carpeta del xlet.
- Si este xlet no está disponible en su idioma, la localización puede ser creada siguiendo [estas instrucciones](https://github.com/Odyseus/CinnamonTools/wiki/Xlet-localization) y luego enviarme el archivo .po.
    - Si se posee una cuenta de GitHub:
        - Puede enviar una "pull request" con el nuevo archivo de localización.
        - Si no se desea clonar el repositorio, simplemente crear un [Gist](https://gist.github.com/) y enviarme el enlace.
    - Si no se posee o no se quiere una cuenta de GitHub:
        - Se puede enviar un [Pastebin](http://pastebin.com/) (o servicio similar) a mi [cuenta en el foro de Linux Mint](https://forums.linuxmint.com/memberlist.php?mode=viewprofile&u=164858).
- Si el texto fuente (en Inglés) y/o mi traducción al Español contiene errores o inconsistencias, no dude en informarlos.
