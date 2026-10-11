/* ==========================================================================
   CÓDIGO HUMANO · TEMPORADA 1 — DATOS EDITABLES
   --------------------------------------------------------------------------
   Para sumar un episodio, copia una fila de "episodios" y cambia sus datos.
   La línea de tiempo, la música, el índice y la barra de progreso se
   recalculan solas.

   · titulo / idea: las palabras entre *asteriscos* se destacan en violeta.
   · fecha: formato AAAA-MM-DD.
   · invitados: [] si el episodio fue solo con Felipe y Alejandro.
   · escena: la animación propia del episodio. Opciones:
       huella · compuerta · documento · rompecabezas · red · radar ·
       bote · mente · ficha · brote · ondas (genérica, para episodios nuevos)
   ========================================================================== */
window.CH_DATA = {
  programa: {
    nombre: "Código Humano",
    temporada: "Temporada 1",
    subtitulo: "Inteligencia artificial en lenguaje humano",
    conductores: ["Felipe Berckemeyer", "Alejandro Castro-Mendívil"],
    horario: "En vivo cada martes, 2:00 p. m.",
    canal: "Origen Xtream",
    tesis: ["La IA amplifica,", "no *reemplaza*."],
    tesis2: "Que lo complicado no sea *complejo*."
  },

  aperturaEnFrio: {
    etiqueta: "CH-S01-E01 · 4 DE AGOSTO DE 2026",
    linea1: "Si la inteligencia artificial hace todo mejor…",
    linea2: "¿qué nos *queda*?"
  },

  episodios: [
    {
      id: "CH-S01-E01", fecha: "2026-08-04",
      titulo: "Si la IA hace todo mejor… ¿qué nos *queda*?",
      invitados: [],
      idea: "¿Qué harías aunque una máquina lo hiciera mejor que tú?",
      codigoUtil: "Prompt «Arregla tu vida en un día»",
      escena: "huella"
    },
    {
      id: "CH-S01-E02", fecha: "2026-08-11",
      titulo: "¿Quién vigila la IA del *Estado*?",
      invitados: [],
      idea: "Donde funcionó, la máquina sugiere y una persona decide.",
      codigoUtil: "NotebookLM con el reglamento peruano de IA",
      escena: "compuerta"
    },
    {
      id: "CH-S01-E03", fecha: "2026-08-18",
      titulo: "Quién revisa lo que el Estado *compra*",
      invitados: [{ nombre: "José Ignacio Beteta", rol: "Denaria Perú" }],
      idea: "Para poder parar la máquina, primero hay que poder verla.",
      codigoUtil: "Cómo pedir información pública",
      escena: "documento"
    },
    {
      id: "CH-S01-E04", fecha: "2026-08-25",
      titulo: "¿La IA te va a dejar sin *trabajo*?",
      invitados: [],
      idea: "Automatizar una tarea no significa entender un puesto.",
      codigoUtil: "NotebookLM: cómo puede cambiar tu trabajo",
      escena: "rompecabezas"
    },
    {
      id: "CH-S01-E05", fecha: "2026-09-01",
      titulo: "El vendedor que nunca *duerme*",
      invitados: [
        { nombre: "Tarek Mohanna", rol: "Cofundador de Ventía" },
        { nombre: "Sebastián Casabonne", rol: "Cofundador de Ventía" }
      ],
      idea: "La pregunta es qué parte de tu negocio decides tú.",
      codigoUtil: "Guía para automatizar ventas por WhatsApp",
      escena: "red"
    },
    {
      id: "CH-S01-E06", fecha: "2026-09-08",
      titulo: "¿Puede una IA *conocerte* mejor que tú?",
      invitados: [{ nombre: "Beatriz Abad", rol: "Doctora en Psicología · HumanAI" }],
      idea: "La IA no viene a quitarnos el trabajo: viene a pedirnos otra cosa.",
      codigoUtil: "Prueba gratuita de HumanAI",
      escena: "radar"
    },
    {
      id: "CH-S01-E07", fecha: "2026-09-15",
      titulo: "¿La IA ya se nos está *escapando*?",
      invitados: [],
      idea: "Las conductas dependen de cómo diseñamos los sistemas.",
      codigoUtil: "",
      escena: "bote"
    },
    {
      id: "CH-S01-E08", fecha: "2026-09-22",
      titulo: "Inteligencia, *conciencia* y el peor escenario",
      invitados: [{ nombre: "Branko Marusic", rol: "Filósofo, educador y autor" }],
      idea: "Lo decisivo es qué permisos le damos y quién supervisa.",
      codigoUtil: "Cinco preguntas antes de compartir un titular",
      escena: "mente"
    },
    {
      id: "CH-S01-E09", fecha: "2026-09-29",
      titulo: "¿Quién controla a los dueños de la *IA*?",
      invitados: [{ nombre: "Alfredo Pérsico", rol: "Fundador de FutureLab" }],
      idea: "Antes del siguiente permiso, saber quién responde.",
      codigoUtil: "Ficha de permisos para agentes",
      escena: "ficha"
    },
    {
      id: "CH-S01-E10", fecha: "2026-10-06",
      titulo: "¿Quién quiero *ser* en la era de la IA?",
      invitados: [{ nombre: "Alfredo Pérsico", rol: "Fundador de FutureLab" }],
      idea: "La IA funciona mejor cuando acompaña a las personas.",
      codigoUtil: "Mi próxima prueba: algo útil en siete días",
      escena: "brote"
    }
  ]
};
