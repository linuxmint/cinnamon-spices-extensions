
# Ayuda para la extensión Ajustes de Cinnamon

### ¡IMPORTANTE!
Jamás borrar ninguno de los archivos encontrados dentro de la carpeta de este xlet. Podría romper la funcionalidad del xlet.

***

<h2 style="color:red;">Reportes de fallos, peticiones de características y contribuciones</h2>
<span style="color:red;">
Si cualquiera tiene fallos que reportar, peticiones de características y contribuciones, deben realizarlas <a href="https://github.com/Odyseus/CinnamonTools">en la página de GitHub de este xlet</a>.
</span>

***

## Detalles de las opciones de la extensión

<span style="color:red;font-weight: bold;font-size: large;">Algunos ajustes tienen advertencias, dependencias, limitaciones y/o problemas conocidos que deben ser leídos y entendidos antes de habilitar un ajuste. No preocuparse, nada <em>fatal</em> podría suceder.</span>

### Ajustes de applets/desklets

- **Pedir confirmación al eliminar applet/desklet:** En vez de directamente remover un applet/desklet desde los menúes contextuales, un diálogo de confirmación será mostrado. Esta opción no afecta la eliminación de applets/desklets desde el administrador de applet/desklets dentro de Configuración de Cinnamon (diálogo de confirmación no será mostrado).
- **Mostrar "Abrir carpeta del applet/desklet" en el menú contextual** y **Mostrar "Editar archivo principal del applet/desklet" en el menú contextual:** Estas opciones agregarán nuevos ítems a los menúes contextuales de applets/desklets. El lugar donde estos ítems serán colocados puede elegirse con la opción **¿Dónde colocar el elemento...?**.

### Ajustes de esquinas activas

Este ajuste está disponible sólo para versiones de Cinnamon menores a 3.2.x. Cinnamon 3.2.x ya posee retardo de activación para esquinas activas.

- **Retardo de activación para la esquina superior izquierda:** Claro como el cristal.
- **Retardo de activación para la esquina superior derecha:** Claro como el cristal.
- **Retardo de activación para la esquina inferior izquierda:** Claro como el cristal.
- **Retardo de activación para la esquina inferior derecha:** Claro como el cristal.

### Ajustes del área de escritorio

- **Habilitar soltar aplicaciones en el escritorio:** Este ajuste habilita a las aplicaciones para que se puedan arrastrar desde el menú y desde los lanzadores del panel y sean soltadas en el escritorio.

### Ajustes de menúes emergentes

**Comportamiento de los menúes del panel**

**Nota:** Esta opción afecta solamente el comportamiento de los menúes que perteneces a applets colocados en cualquier panel.

- **Emular el comportamiento de los menúes de Gnome Shell:** Cuando un menú está abierto en Gnome Shell y, a continuación, el cursor del ratón se mueve a otro botón en el panel superior, el menú de los botones por los cuales el cursor del ratón está pasando se abrirán automáticamente sin necesidad de hacer clic en ellos. Con esta opción habilitada, ese mismo comportamiento se puede reproducir en Cinnamon.
- **No consumir clics:** De forma predeterminada, cuando se abre el menú de un applet en Cinnamon y luego se hace clic en otro applet para abrir su menú, el primer clic se utiliza para cerrar el primer menú abierto y, a continuación, se debe realizar otro clic para abrir el menú del segundo applet. Con esta opción habilitada, se puede abrir directamente el menú de cualquier applet incluso si otro applet tiene su menú abierto.

### Ajustes de caja de herramientas

- **Evitar la superposición de puntero del ratón sobre las cajas de información sobre herramientas:** Las cajas de información en la interfaz de usuario de Cinnamon están alineadas con la esquina superior izquierda del puntero del ratón. Esto lleva a tener esta información superpuesta por el puntero del ratón. Este ajuste alinea la caja de información sobre herramientas en la esquina inferior derecha del puntero del ratón (aproximadamente), reduciendo la posibilidad de que el puntero del ratón se solape con la caja de información sobre herramientas.
- **Retardo para mostrar información sobre herramientas:** Estableces un retraso en milisegundos para mostrar información sobre herramientas de la interfaz de Cinnamon.

### Ajustes de notificaciones

- **Habilitar animación de notificaciones:** Claro como el cristal.
- **Posición de las notificaciones:** Notificaciones pueden ser mostradas en la esquina superior derecha de la pantalla (por defecto del sistema) o en la esquina inferior derecha de la pantalla.
- **Distancia desde el panel:**
    - **Para las notificaciones que se muestran en la parte superior derecha de la pantalla:** Esta la distancia entre el borde inferior del panel superior (si no hay panel superior, desde la parte superior de la pantalla) hasta el borde superior de la ventana emergente de notificación.
    - **Para las notificaciones que se muestran en la parte inferior derecha de la pantalla:** Esta la distancia entre el borde superior del panel inferior (si no hay panel inferior, desde la parte inferior de la pantalla) hasta el borde inferior de la ventana emergente de notificación.

- **Margen derecho del popup de las notificaciones:** Por defecto, el margen derecho de la notificación es definido por el tema que se usa actualmente. Esta opción, con un valor distinto de 0 (cero), permite establecer un margen derecho personalizado, ignorando el definido por el tema.

### Ajustes de foco de ventanas

Ajuste basado en la extensión para Gnome Shell llamada [Steal My Focus](https://github.com/v-dimitrov/gnome-shell-extension-stealmyfocus) por [Valentin Dimitrov](https://github.com/v-dimitrov) y otra extensión para Gnome Shell llamada [Window Demands Attention Shortcut](https://github.com/awamper/window-demands-attention-shortcut) por [awamper](https://github.com/awamper).

Algunas ventanas que requieren atención no ganarán enfoque independientemente de la combinación de ajustes en la configuración de Cinnamon. Esta opción nos permitirá corregir esto.

- **La activación de ventanas que demandan atención...:**
    - **...es manejada por el sistema:** Claro como el cristal.
    - **...es inmediata:** Las ventanas que requieren atención serán enfocadas inmediatamente.
    - **...se lleva a cabo con un atajo de teclado:** Las ventanas que requieren atención serán enfocadas bajo demanda con un atajo de teclado.
- **Atajo de teclado:** Establecer un atajo de teclado para la opción **...is performed with a keyboard shortcut**.

### Ajustes de sombras de ventana

Ajuste basado en la extensión para Cinnamon llamada [Custom Shadows](https://cinnamon-spices.linuxmint.com/extensions/view/43) creada por [mikhail-ekzi](https://github.com/mikhail-ekzi). Permite modificar las sombras usadas por el gestor de ventanas de Cinnamon (Muffin).

**Note:** Las ventanas decoradas del lado del cliente no se ven afectadas por este ajuste.

**Preajustes de sombra**
- **Sombras personalizadas**
- **Sombras por defecto**
- **Sin sombras**
- **Sombras de Windows 10**

### Mover ventanas automáticamente

Ajuste basado en la extensión para Gnome Shell llamada [Auto Move Windows](https://extensions.gnome.org/extension/16/auto-move-windows/) por [Florian Muellner](https://github.com/fmuellner). Permite la creación de reglas para abrir determinadas aplicaciones en áreas de trabajo específicas.

**Nota:** Si la aplicación que se quiere seleccionar no se muestra en el diálogo selector de aplicaciones, leer la sección de este archivo de ayuda llamada **Aplicaciones que no aparecen en los cuadros de diálogo de selección de aplicaciones**.

### Eliminación de decoraciones de ventanas
Ajuste basado en la extensión para Cinnamon llamada [Cinnamon Maximus](https://cinnamon-spices.linuxmint.com/extensions/view/29) por [Fatih Mete](https://github.com/fatihmete) con algunas opciones extraídas de la extensión para Gnome Shell llamada [Maximus NG](https://github.com/luispabon/maximus-gnome-shell) por [Luis Pabon](https://github.com/luispabon). Este ajuste permite remover las decoraciones de ventanas maximizadas/medio-maximizadas/en mosaico.

**Nota:** Si la aplicación que se quiere seleccionar no se muestra en el diálogo selector de aplicaciones, leer la sección de este archivo de ayuda llamada **Aplicaciones que no aparecen en los cuadros de diálogo de selección de aplicaciones**.

#### Dependencias

Este ajuste requiere dos comandos disponibles en el sistema (**xprop** y **xwininfo**) para que funcione.
- Distribuciones basadas en Debian: Estos comandos son proporcionados por el paquete **x11-utils**. Linux Mint ya tiene este paquete instalado.
- Distribuciones basadas en Archlinux: Estos comandos son proporcionados por los paquetes **xorg-xprop** y **xorg-xwininfo**.
- Distribuciones basadas en Fedora: Estos comandos son proporcionados por el paquete **xorg-x11-utils**.

#### Advertencias

- Las ventanas decoradas del lado del cliente y las aplicaciones WINE no se ven afectadas por este ajuste.
- Cerrar todas las ventanas que pertenecen a una aplicación que se va a agregar a la lista de aplicaciones y antes de aplicar las configuraciones de este ajuste.
- Como regla general para evitar problemas, antes de activar y configurar este ajuste, cerrar todas las ventanas actualmente abiertas, activar y configurar este ajuste y luego cerrar la sesión y volver a entrar.

#### Problemas conocidos

- **Ventanas invisibles:** A veces, las ventanas de aplicaciones que están configuradas para que sus decoraciones sean removidas se pueden volver invisibles. El ícono de la aplicación todavía puede verse en el panel (barra de tareas) y cuando se le hace clic para enfocar su ventana respectiva, la ventana invisible va a bloquear los clics como si estuviera normalmente visible. Para arreglar esto, la ventana necesita ser des-maximizada (se volverá visible) y luego cerrada. Cuando se reabre la aplicación, su ventana debería comportarse normalmente.
- **Aplicaciones atascadas sin decoraciones:** A veces, una aplicación queda atascada sin decoraciones incluso después de volver a maximizarla. Reiniciado la aplicación hará que su capacidad para cambiar su estado decorada y sin decorar sea recuperada.

***

## Problemas generales de la extensión

### Aplicaciones no aparecen en los cuadros de diálogo de selección de aplicaciones

El selector de aplicaciones usado por la ventana de preferencias de esta extensión lista sólo las aplicaciones que tienen un archivo .desktop disponible. Simplemente porque estas son las aplicaciones que cualquiera de los ajustes que requieren una ID de aplicación (**Mover ventanas automáticamente** y **Eliminación de decoraciones de ventanas**) van a reconocer.

Siguiendo la [Especificación para Entradas de Escritorio](https://specifications.freedesktop.org/desktop-entry-spec/latest/index.html), uno puede crear un archivo .desktop para cualquier aplicación que no aparece en la lista de aplicaciones.

***

### Localización de applets/desklets/extensiones (también conocidos como xlets)

- Si este xlet se instaló desde Configuración de Cinnamon, todas las localizaciones de este xlet se instalaron automáticamente.
- Si este xlet se instaló manualmente y no a través de Configuración de Cinnamon, las localizaciones se pueden instalar ejecutando el archivo llamado **localizations.sh** desde una terminal abierta dentro de la carpeta del xlet.
- Si este xlet no está disponible en su idioma, la localización puede ser creada siguiendo [estas instrucciones](https://github.com/Odyseus/CinnamonTools/wiki/Xlet-localization) y luego enviarme el archivo .po.
    - Si se posee una cuenta de GitHub:
        - Puede enviar una "pull request" con el nuevo archivo de localización.
        - Si no se desea clonar el repositorio, simplemente crear un [Gist](https://gist.github.com/) y enviarme el enlace.
    - Si no se posee o no se quiere una cuenta de GitHub:
        - Se puede enviar un [Pastebin](http://pastebin.com/) (o servicio similar) a mi [cuenta en el for de Linux Mint](https://forums.linuxmint.com/memberlist.php?mode=viewprofile&u=164858).
- Si el texto fuente (en Inglés) y/o mi traducción al Español contiene errores o inconsistencias, no dude en informarlos.
