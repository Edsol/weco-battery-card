// ── Editor ─────────────────────────────────────────────────────────────────
class WecoBatteryCardEditor extends HTMLElement {
    constructor() {
        super(...arguments);
        this._initialized = false;
        this._updatingValues = false;
    }
    setConfig(config) {
        this._config = config;
        if (!this._initialized) {
            if (this._hass)
                this._buildDOM();
        }
        else {
            this._applyValues();
            this._updateEntityPickers();
        }
    }
    set hass(hass) {
        this._hass = hass;
        if (!this._initialized) {
            if (this._config)
                this._buildDOM();
        }
        else {
            this.querySelectorAll('ha-entity-picker, ha-device-picker').forEach(el => {
                el.hass = hass;
            });
            this._updateEntityPickers();
        }
    }
    _getDeviceEntities() {
        const deviceId = this._config?.device_id;
        if (!deviceId || !this._hass?.entities)
            return undefined;
        return Object.values(this._hass.entities)
            .filter(e => e.device_id === deviceId)
            .map(e => e.entity_id);
    }
    _updateEntityPickers() {
        const entityIds = this._getDeviceEntities();
        this.querySelectorAll('.sensor-picker').forEach(picker => {
            picker.includeEntities = entityIds ?? undefined;
        });
    }
    _buildDOM() {
        if (this._initialized)
            return;
        this._initialized = true;
        this.innerHTML = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <ha-textfield id="f-title" label="Title"></ha-textfield>

        <ha-device-picker id="f-device-id" label="MQTT Device"></ha-device-picker>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); font-weight: 500;
                    border-top: 1px solid var(--divider-color); padding-top: 10px; margin-top: 2px;">
          Sensors (up to 4)
        </div>
        <p style="font-size:0.75em; color:var(--secondary-text-color); margin:-6px 0 0 0;">
          Select the MQTT device first to filter available sensors.
        </p>

        <ha-entity-picker id="f-sensor-1" class="sensor-picker" label="Sensor 1" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="f-sensor-2" class="sensor-picker" label="Sensor 2" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="f-sensor-3" class="sensor-picker" label="Sensor 3" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="f-sensor-4" class="sensor-picker" label="Sensor 4" allow-custom-entity></ha-entity-picker>

        <ha-formfield label="Show cell voltage grid">
          <ha-switch id="f-show-cells"></ha-switch>
        </ha-formfield>
        <p style="font-size:0.75em; color:var(--secondary-text-color); margin:-6px 0 0 0;">
          Cell voltages (cell_1 … cell_16) are detected automatically from the selected device.
        </p>

        <ha-formfield label="Show last update date/time">
          <ha-switch id="f-show-last-updated"></ha-switch>
        </ha-formfield>
      </div>`;
        const configKeys = {
            '#f-title': 'title',
            '#f-device-id': 'device_id',
            '#f-sensor-1': 'sensor_1',
            '#f-sensor-2': 'sensor_2',
            '#f-sensor-3': 'sensor_3',
            '#f-sensor-4': 'sensor_4',
            '#f-show-cells': 'show_cells',
            '#f-show-last-updated': 'show_last_updated',
        };
        Object.entries(configKeys).forEach(([sel, key]) => {
            const el = this.querySelector(sel);
            if (el)
                el.configValue = key;
        });
        this._applyValues();
        this._updateEntityPickers();
        this.querySelectorAll('ha-textfield').forEach(el => {
            el.addEventListener('change', ev => this._valueChanged(ev));
        });
        this.querySelectorAll('ha-entity-picker, ha-device-picker').forEach(el => {
            el.addEventListener('value-changed', ev => this._valueChanged(ev));
        });
        this.querySelectorAll('ha-switch').forEach(el => {
            el.addEventListener('change', ev => this._valueChanged(ev));
        });
    }
    _applyValues() {
        if (!this._initialized || !this._config)
            return;
        this._updatingValues = true;
        const c = this._config;
        const setProp = (id, val) => {
            const el = this.querySelector(id);
            if (el && el.value !== (val ?? ''))
                el.value = val ?? '';
        };
        setProp('#f-title', c.title);
        setProp('#f-device-id', c.device_id);
        setProp('#f-sensor-1', c.sensor_1);
        setProp('#f-sensor-2', c.sensor_2);
        setProp('#f-sensor-3', c.sensor_3);
        setProp('#f-sensor-4', c.sensor_4);
        const swCells = this.querySelector('#f-show-cells');
        if (swCells)
            swCells.checked = c.show_cells ?? true;
        const sw = this.querySelector('#f-show-last-updated');
        if (sw)
            sw.checked = c.show_last_updated ?? false;
        if (this._hass) {
            this.querySelectorAll('ha-entity-picker, ha-device-picker').forEach(el => {
                el.hass = this._hass;
            });
        }
        requestAnimationFrame(() => { this._updatingValues = false; });
    }
    _valueChanged(ev) {
        if (this._updatingValues)
            return;
        if (!this._config || !this._hass)
            return;
        const target = ev.target;
        const configValue = target.configValue;
        if (!configValue)
            return;
        const detail = ev.detail;
        let value;
        if (target.tagName === 'HA-SWITCH') {
            value = !!target.checked;
        }
        else {
            value = detail?.value !== undefined ? detail.value : (target.value ?? '');
        }
        if (this._config[configValue] === value)
            return;
        const newConfig = { ...this._config, [configValue]: value };
        this._config = newConfig;
        // Se cambia il dispositivo, aggiorna il filtro delle entity picker
        if (configValue === 'device_id') {
            this._updateEntityPickers();
        }
        this.dispatchEvent(new CustomEvent('config-changed', {
            detail: { config: newConfig },
            bubbles: true,
            composed: true,
        }));
    }
}
customElements.define('weco-battery-card-editor', WecoBatteryCardEditor);
// ── Card principale ─────────────────────────────────────────────────────────
class WecoBatteryCard extends HTMLElement {
    static getConfigElement() {
        return document.createElement('weco-battery-card-editor');
    }
    static getStubConfig() {
        return { title: 'WECO Battery' };
    }
    setConfig(config) {
        if (!config)
            throw new Error('Configuration not valid');
        this.config = config;
        if (this._hass)
            this._render();
    }
    set hass(hass) {
        this._hass = hass;
        if (!this.content) {
            this.innerHTML = `
        <style>
          ha-card { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); border: 1px solid rgba(128,128,128,0.1); overflow: hidden; }
          .weco-card { padding: 16px; font-family: sans-serif; }
          .header { font-size: 1.1em; font-weight: bold; color: var(--primary-text-color); }
          .header.has-link { cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
          .header.has-link:hover { color: var(--primary-color); }
          .header.has-link::after { content: '↗'; font-size: 0.7em; opacity: 0.6; }
          .last-updated { font-size: 0.72em; color: var(--secondary-text-color); margin-bottom: 12px; margin-top: 4px; }

          .stats-row { display: grid; gap: 8px; background: rgba(128,128,128,0.08); padding: 12px 8px; border-radius: 8px; margin-bottom: 15px; }
          .stats-row.cols-1 { grid-template-columns: 1fr; }
          .stats-row.cols-2 { grid-template-columns: repeat(2, 1fr); }
          .stats-row.cols-3 { grid-template-columns: repeat(3, 1fr); }
          .stats-row.cols-4 { grid-template-columns: repeat(4, 1fr); }
          .stat        { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .stat-value  { font-size: 1.2em; font-weight: bold; white-space: nowrap; }
          .stat-label  { font-size: 0.7em; color: var(--secondary-text-color); text-transform: uppercase; margin-top: 4px;
                         max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

          [data-entity] { cursor: pointer; }
          [data-entity]:hover { opacity: 0.75; }

          .cell-grid    { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
          .cell-box     { background: var(--card-background-color); border: 1px solid rgba(128,128,128,0.2); border-radius: 6px; padding: 6px 2px; text-align: center; min-height: 52px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
          .cell-name    { font-size: 0.65em; color: var(--secondary-text-color); margin-bottom: 2px; }
          .cell-volt    { font-weight: bold; font-family: monospace; font-size: 1.05em; line-height: 1.1; }
          .volt-highest { color: #73bf69; }
          .volt-lowest  { color: #f2495c; }
          .cell-balance { font-size: 0.65em; color: #ff9830; font-weight: bold; margin-top: 2px; }
          .is-balancing { border-color: #ff9830; background: rgba(255,152,48,0.05); }
        </style>
        <ha-card>
          <div class="weco-card">
            <div class="header" id="card-title"></div>
            <div class="last-updated" id="card-last-updated"></div>
            <div id="content-area"></div>
          </div>
        </ha-card>`;
            this.content = this.querySelector('#content-area');
            this.titleEl = this.querySelector('#card-title');
            this.lastUpdatedEl = this.querySelector('#card-last-updated');
            this._setupClickHandler();
        }
        this._render();
    }
    _setupClickHandler() {
        if (!this.content)
            return;
        this.content.addEventListener('click', (ev) => {
            const target = ev.target;
            const clickable = target.closest('[data-entity]');
            if (!clickable)
                return;
            const entityId = clickable.dataset['entity'];
            if (!entityId)
                return;
            ev.stopPropagation();
            this.dispatchEvent(new CustomEvent('hass-more-info', {
                detail: { entityId },
                bubbles: true,
                composed: true,
            }));
        });
    }
    _render() {
        if (!this.config || !this._hass)
            return;
        const config = this.config;
        // Titolo
        if (this.titleEl) {
            this.titleEl.textContent = config.title ?? 'WECO Battery';
            if (config.device_id) {
                this.titleEl.classList.add('has-link');
                this.titleEl.onclick = () => this._navigateToDevice(config.device_id);
            }
            else {
                this.titleEl.classList.remove('has-link');
                this.titleEl.onclick = null;
            }
        }
        const st = (id) => id ? this._hass.states[id] : undefined;
        // Sensori configurati (filtra slot vuoti)
        const sensorIds = [config.sensor_1, config.sensor_2, config.sensor_3, config.sensor_4]
            .filter((s) => !!s);
        const sensors = sensorIds.map(id => ({ id, entity: st(id) }));
        // Ultimo aggiornamento (usa il primo sensore come riferimento)
        if (this.lastUpdatedEl) {
            if (config.show_last_updated && sensors.length > 0) {
                const ref = sensors[0].entity;
                if (ref?.last_updated) {
                    const d = new Date(ref.last_updated);
                    this.lastUpdatedEl.textContent = `Updated: ${d.toLocaleString()}`;
                    this.lastUpdatedEl.style.display = '';
                }
                else {
                    this.lastUpdatedEl.style.display = 'none';
                }
            }
            else {
                this.lastUpdatedEl.style.display = 'none';
            }
        }
        let html = '';
        if (sensors.length > 0) {
            const cols = Math.min(sensors.length, 4);
            html += `<div class="stats-row cols-${cols}">`;
            sensors.forEach(({ id, entity }) => {
                html += this._stat(entity, this._label(entity, id), id);
            });
            html += `</div>`;
        }
        // Cell grid — auto-rilevamento dal dispositivo (solo se abilitato)
        const cellEntityIds = (config.show_cells !== false) && config.device_id
            ? this._findCellEntities(config.device_id)
            : [];
        if (cellEntityIds.length > 0) {
            const cells = cellEntityIds.map((vId, i) => {
                const bId = vId.replace(/^sensor\./, 'binary_sensor.') + '_balance';
                const v = this._hass.states[vId];
                const b = this._hass.states[bId];
                return { n: String(i + 1), id: vId, v: v ? parseFloat(v.state) : NaN, b: b?.state === 'on' };
            });
            const vals = cells.map(c => c.v).filter(v => !isNaN(v));
            const maxV = Math.max(...vals);
            const minV = Math.min(...vals);
            html += `<div class="cell-grid">`;
            cells.forEach(c => {
                const isMax = vals.length > 1 && c.v === maxV;
                const isMin = vals.length > 1 && c.v === minV;
                const cls = isMax ? 'volt-highest' : (isMin ? 'volt-lowest' : '');
                html += `
          <div class="cell-box ${c.b ? 'is-balancing' : ''}" data-entity="${c.id}">
            <div class="cell-name">C${c.n}</div>
            <div class="cell-volt ${cls}">${isNaN(c.v) ? '---' : c.v.toFixed(3)}</div>
            ${c.b ? '<div class="cell-balance">▲ bal</div>' : ''}
          </div>`;
            });
            html += `</div>`;
        }
        if (this.content)
            this.content.innerHTML = html;
    }
    // Usa friendly_name dell'entità; fallback all'ultima parte dell'entity_id
    _label(entity, entityId) {
        const fn = entity?.attributes?.friendly_name;
        if (fn)
            return fn;
        return entityId.split('.')[1]?.replace(/_/g, ' ') ?? entityId;
    }
    _navigateToDevice(deviceId) {
        const url = `/config/devices/device/${deviceId}`;
        window.history.pushState({ path: url }, '', url);
        window.dispatchEvent(new CustomEvent('location-changed', {
            detail: { replace: false },
        }));
    }
    _val(entity) {
        return entity ? entity.state : '---';
    }
    _unit(entity) {
        return entity?.attributes?.unit_of_measurement ?? '';
    }
    // Trova le entità celle del dispositivo (es. *_cell_1 … *_cell_16), ordinate numericamente
    _findCellEntities(deviceId) {
        if (!this._hass?.entities)
            return [];
        const cellPattern = /[_-]cell[_-]?(\d+)$/i;
        return Object.values(this._hass.entities)
            .filter(e => e.device_id === deviceId && cellPattern.test(e.entity_id))
            .sort((a, b) => {
            const na = parseInt(cellPattern.exec(a.entity_id)[1], 10);
            const nb = parseInt(cellPattern.exec(b.entity_id)[1], 10);
            return na - nb;
        })
            .map(e => e.entity_id);
    }
    _stat(entity, label, entityId) {
        const attr = entityId ? ` data-entity="${entityId}"` : '';
        return `<div class="stat"${attr}>
      <span class="stat-value">${this._val(entity)}${this._unit(entity)}</span>
      <span class="stat-label" title="${label}">${label}</span>
    </div>`;
    }
    getCardSize() {
        return this.config?.device_id ? 8 : 3;
    }
}
customElements.define('weco-battery-card', WecoBatteryCard);
// ── Registrazione nel picker di HA ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _win = window;
_win.customCards = _win.customCards || [];
_win.customCards.push({
    type: 'weco-battery-card',
    name: 'WECO Battery',
    description: 'Displays the status of the WECO battery',
    preview: true,
});
