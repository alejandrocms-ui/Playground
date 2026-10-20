"""Server-side message catalogue (Spanish / Italian) for findings and diagnostics."""

MESSAGES = {
    "import_incomplete": (
        "Importación incompleta: {count} asuntos pendientes en meta.import_audit.blockers. "
        "Completa y confirma las fuentes y vuelve a importar; no se puede evaluar la factibilidad.",
        "Importazione incompleta: {count} questioni aperte in meta.import_audit.blockers. "
        "Completa e conferma le fonti, poi importa di nuovo; la fattibilità non è valutabile."),
    "unknown_section": ("La lección {entity} referencia una sección inexistente ({ref}).",
                        "La lezione {entity} fa riferimento a una classe inesistente ({ref})."),
    "unknown_subject": ("La lección {entity} referencia una materia inexistente ({ref}).",
                        "La lezione {entity} fa riferimento a una materia inesistente ({ref})."),
    "unknown_teacher": ("La lección {entity} referencia un docente inexistente ({ref}).",
                        "La lezione {entity} fa riferimento a un docente inesistente ({ref})."),
    "unknown_room": ("La lección {entity} referencia un aula inexistente ({ref}).",
                     "La lezione {entity} fa riferimento a un'aula inesistente ({ref})."),
    "unknown_bell": ("La sección {entity} usa un horario de timbres inexistente ({ref}).",
                     "La classe {entity} usa un orario delle campanelle inesistente ({ref})."),
    "no_teacher": ("La lección {entity} no tiene docente asignado.",
                   "La lezione {entity} non ha un docente assegnato."),
    "blocks_mismatch": ("La lección {entity}: los bloques suman {actual} pero se requieren {expected} horas.",
                        "La lezione {entity}: i blocchi sommano {actual} ma sono richieste {expected} ore."),
    "unplaced": ("{occ} no está colocada en el horario.",
                 "{occ} non è collocata nell'orario."),
    "duplicate": ("{occ} aparece colocada más de una vez.",
                  "{occ} risulta collocata più di una volta."),
    "unknown_occ": ("La colocación {occ} no corresponde a ninguna lección.",
                    "Il posizionamento {occ} non corrisponde ad alcuna lezione."),
    "block_window": ("{occ}: el bloque no cabe en {day} desde la hora {period} o cruza un recreo.",
                     "{occ}: il blocco non entra il {day} dall'ora {period} o attraversa un intervallo."),
    "room_eligibility": ("{occ}: el aula {room} no está permitida para esta lección.",
                         "{occ}: l'aula {room} non è ammessa per questa lezione."),
    "overlap_teacher": ("Choque de docente {res} el {day} ({time}): {occs}.",
                        "Sovrapposizione del docente {res} il {day} ({time}): {occs}."),
    "overlap_section": ("Choque de sección {res} el {day} ({time}): {occs}.",
                        "Sovrapposizione della classe {res} il {day} ({time}): {occs}."),
    "overlap_room": ("Choque de aula {res} el {day} ({time}): {occs}.",
                     "Sovrapposizione dell'aula {res} il {day} ({time}): {occs}."),
    "teacher_allowed_days": ("{occ}: {teacher} solo puede dictar {days} (regla {rule}).",
                             "{occ}: {teacher} può insegnare solo {days} (regola {rule})."),
    "teacher_unavailable": ("{occ}: {teacher} no está disponible el {day} a esa hora (regla {rule}).",
                            "{occ}: {teacher} non è disponibile il {day} a quell'ora (regola {rule})."),
    "section_unavailable": ("{occ}: la sección no tiene clase el {day} a esa hora (regla {rule}).",
                            "{occ}: la classe non ha lezione il {day} a quell'ora (regola {rule})."),
    "teacher_max_days": ("{teacher} enseña {actual} días; máximo {max} (regla {rule}).",
                         "{teacher} insegna {actual} giorni; massimo {max} (regola {rule})."),
    "teacher_max_day": ("{teacher} tiene {actual} horas el {day}; máximo {max}.",
                        "{teacher} ha {actual} ore il {day}; massimo {max}."),
    "teacher_max_week": ("{teacher} tiene {actual} horas semanales; máximo {max}.",
                         "{teacher} ha {actual} ore settimanali; massimo {max}."),
    "spread": ("La lección {lesson} tiene dos bloques el mismo día ({day}).",
               "La lezione {lesson} ha due blocchi nello stesso giorno ({day})."),
    "preferred_periods": ("{occ}: {count} hora(s) fuera de la franja preferida (regla {rule}).",
                          "{occ}: {count} ora/e fuori dalla fascia preferita (regola {rule})."),
    "avoid_slot": ("{occ}: ocupa una franja a evitar (regla {rule}).",
                   "{occ}: occupa una fascia da evitare (regola {rule})."),
    "teacher_compact_days": ("{teacher}: {actual} días con clase; mínimo posible {min} (regla {rule}).",
                             "{teacher}: {actual} giorni con lezione; minimo possibile {min} (regola {rule})."),
    "teacher_gaps": ("{teacher}: {count} hueco(s) el {day} (regla {rule}).",
                     "{teacher}: {count} buco/hi il {day} (regola {rule})."),
    # diagnostics
    "no_candidates": ("{occ} ({subject}, {section}) no tiene ninguna franja válida: revisa días permitidos, indisponibilidades y bloques.",
                      "{occ} ({subject}, {section}) non ha alcuna fascia valida: verifica giorni ammessi, indisponibilità e blocchi."),
    "teacher_capacity": ("{teacher} necesita {demand} horas pero solo tiene {capacity} franjas disponibles ({demand} > {capacity}).",
                         "{teacher} necessita di {demand} ore ma ha solo {capacity} fasce disponibili ({demand} > {capacity})."),
    "teacher_week_cap": ("{teacher} tiene asignadas {demand} horas pero su máximo semanal es {max}.",
                         "{teacher} ha {demand} ore assegnate ma il suo massimo settimanale è {max}."),
    "teacher_day_cap": ("{teacher}: {demand} horas no caben en {days} días × máximo {max} por día.",
                        "{teacher}: {demand} ore non entrano in {days} giorni × massimo {max} al giorno."),
    "section_capacity": ("La sección {section} necesita {demand} horas pero solo hay {capacity} franjas.",
                         "La classe {section} necessita di {demand} ore ma ci sono solo {capacity} fasce."),
    "room_capacity": ("El aula {room} es la única opción para {demand} horas pero solo tiene {capacity} franjas.",
                      "L'aula {room} è l'unica opzione per {demand} ore ma ha solo {capacity} fasce."),
    "lock_conflict": ("Dos clases fijadas chocan: {occs} ({res}, {day}).",
                      "Due lezioni bloccate si sovrappongono: {occs} ({res}, {day})."),
    "lock_invalid": ("La clase fijada {occ} viola una regla dura en su posición actual.",
                     "La lezione bloccata {occ} viola una regola rigida nella sua posizione attuale."),
    "spread_capacity": ("{lesson}: {n} bloques deben ir en días distintos pero solo {days} días son posibles.",
                        "{lesson}: {n} blocchi devono stare in giorni diversi ma solo {days} giorni sono possibili."),
}

DAY_NAMES = {
    "es": {"MON": "lunes", "TUE": "martes", "WED": "miércoles", "THU": "jueves", "FRI": "viernes", "SAT": "sábado"},
    "it": {"MON": "lunedì", "TUE": "martedì", "WED": "mercoledì", "THU": "giovedì", "FRI": "venerdì", "SAT": "sabato"},
}


def msg(code: str, **params) -> dict:
    es, it = MESSAGES.get(code, (code, code))
    out = {}
    for lang, tpl in (("es", es), ("it", it)):
        p = dict(params)
        if "day" in p:
            p["day"] = DAY_NAMES[lang].get(p["day"], p["day"])
        if "days" in p and isinstance(p["days"], (list, tuple)):
            p["days"] = ", ".join(DAY_NAMES[lang].get(d, d) for d in p["days"])
        try:
            out[lang] = tpl.format(**p)
        except (KeyError, IndexError):
            out[lang] = tpl
    return out
