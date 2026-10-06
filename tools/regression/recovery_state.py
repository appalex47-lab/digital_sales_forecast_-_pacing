"""Lleva Recovery Center a un estado con datos: escenario guardado (ligado a una hipótesis), acción en el plan y una medición.
Con los datos de prueba el diagnóstico no produce hipótesis, así que el ESCENARIO se guarda con el mismo motor de la app
(FP.scenarioEngine.saveScenario, lo mismo que hace el botón) pasando un vínculo de hipótesis de prueba. Solo en la sesión de prueba:
no toca la lógica de la app. La acción y la medición se hacen con los botones reales («Agregar al plan», fechas, «Medir»)."""
async def prepare(q, url, mock_plan=True):
    await q.goto(url + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
    await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
    try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
    except Exception: pass
    await q.goto(url + '#plan'); await q.wait_for_timeout(600)
    for a in ['plan-preview', 'plan-save']:
        try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
        except Exception: pass
    await q.goto(url + '#recovery'); await q.wait_for_selector('#rc-simulator select', timeout=20000)
    # el periodo se fija al último mes con venta real: si no, depende del día en que corre la prueba (el 1.º de mes el mes en curso
    # no tiene días con real y, con un plan importado que no lo cubre, la simulación no es válida)
    last = await q.evaluate("(FP.app.state.store.actual.records.map(r=>r.date).sort().pop()||'').slice(0,7)")
    await q.click('[data-action="rc-ptype"][data-value="month"]'); await q.wait_for_timeout(400)
    if last: await q.select_option('#rc-pkey', last); await q.wait_for_timeout(600)
    if last: await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'periodKey'}},value:'{last}'}})"); await q.wait_for_timeout(400)   # Diagnóstico y Narrativa: mismo mes
    await q.select_option('#rc-apply', 'all'); await q.wait_for_timeout(700)   # retrospectivo: el escenario aplica a todo el periodo, así la medición tiene días con real
    # 1) simulador: volumen +5 % (campo real) y guardado con el motor de la app
    await q.fill('#rc-trafficPct', '5'); await q.press('#rc-trafficPct', 'Tab'); await q.wait_for_timeout(500)
    await q.fill('#rc-name', 'Escenario de prueba volumen'); await q.press('#rc-name', 'Tab'); await q.wait_for_timeout(300)
    ok = await q.evaluate("""()=>{const rc=FP.app.state.rc;if(!rc.preview||!rc.preview.valid)return 'preview inválido';
      const sc=FP.scenarioEngine.saveScenario(rc.scenarioStore,{ctx:rc.ctx,result:rc.preview,name:rc.draft.name,type:rc.draft.type,supersedes:null,
        links:{hypothesisId:'H1',hypothesis:'Hipótesis de prueba (volumen)',signalIds:[],driver:'trafficVolume',diagnosisComparison:null}});
      rc.selected=[sc.scenarioId];rc.draft.name='';rc.draft.trafficPct=0;return 'ok '+sc.scenarioId}""")
    if not str(ok).startswith('ok'): return ok
    await q.evaluate("FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(400)
    # 2) acción real desde el catálogo (primer botón habilitado)
    await q.wait_for_selector('[data-action="rc-add-action"]:not([disabled])', timeout=10000)
    await q.click('[data-action="rc-add-action"]:not([disabled])'); await q.wait_for_timeout(600)
    # 3) ventana de la acción dentro del real cargado, para que «Medir» tenga días observados
    await q.fill('[data-action="rc-action-field"][data-key="startDate"]', '2026-09-01'); await q.press('[data-action="rc-action-field"][data-key="startDate"]', 'Tab'); await q.wait_for_timeout(400)
    await q.fill('[data-action="rc-action-field"][data-key="endDate"]', '2026-09-22'); await q.press('[data-action="rc-action-field"][data-key="endDate"]', 'Tab'); await q.wait_for_timeout(400)
    await q.click('[data-action="rc-measure"]'); await q.wait_for_timeout(700)
    return 'ok'
