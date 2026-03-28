// ── Tipi minimi di Home Assistant ──────────────────────────────────────────
interface HassEntity {
  state: string;
  last_updated?: string;
  attributes: Record<string, unknown> & {
    unit_of_measurement?: string;
    friendly_name?: string;
  };
}

interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
}

interface WecoBatteryConfig {
  title?: string;
  mode?: 'minimal' | 'basic' | 'extended';
  battery_soc?: string;
  battery_power?: string;
  battery_current?: string;
  battery_voltage?: string;
  battery_cell_first?: string;
  device_id?: string;
  show_last_updated?: boolean;
}

// Helper per accedere a proprietà custom sugli HTMLElement di HA
interface HaElement extends HTMLElement {
  hass?: HomeAssistant;
  value?: string;
  configValue?: string;
  checked?: boolean;
}


// ── Editor ─────────────────────────────────────────────────────────────────
class WecoBatteryCardEditor extends HTMLElement {
  private _config?: WecoBatteryConfig;
  private _hass?: HomeAssistant;
  private _initialized = false;
  private _updatingValues = false;

  setConfig(config: WecoBatteryConfig): void {
    this._config = config;
    if (!this._initialized) {
      if (this._hass) this._buildDOM();
    } else {
      this._applyValues();
    }
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._initialized) {
      if (this._config) this._buildDOM();
    } else {
      this.querySelectorAll<HaElement>('ha-entity-picker, ha-device-picker').forEach(el => {
        el.hass = hass;
      });
    }
  }

  private _buildDOM(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.innerHTML = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <ha-textfield id="f-title"   label="Titolo"></ha-textfield>

        <ha-select id="f-mode" label="Modalità" fixedMenuPosition>
          <mwc-list-item value="minimal">Minimal – solo SOC</mwc-list-item>
          <mwc-list-item value="basic">Basic – SOC, Power, Current</mwc-list-item>
          <mwc-list-item value="extended">Extended – tutto + celle</mwc-list-item>
        </ha-select>

        <ha-entity-picker id="f-soc"     label="Entità SOC"     allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="f-power"   label="Entità Power"   allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="f-current" label="Entità Current" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="f-voltage" label="Entità Voltage" allow-custom-entity></ha-entity-picker>

        <ha-entity-picker id="f-cell" label="Prima cella (es: sensor.xxx_cell_01)" allow-custom-entity></ha-entity-picker>
        <p style="font-size:0.75em; color:var(--secondary-text-color); margin:-4px 0 0 0;">
          Seleziona la cella 01 — le restanti (02–16) vengono derivate automaticamente.
        </p>

        <ha-device-picker id="f-device-id" label="Dispositivo MQTT (link nel titolo)"></ha-device-picker>

        <ha-formfield label="Mostra data/ora ultimo aggiornamento">
          <ha-switch id="f-show-last-updated"></ha-switch>
        </ha-formfield>
      </div>`;

    // configValue come proprietà JS — non funziona tramite attributo in innerHTML
    const configKeys: Record<string, keyof WecoBatteryConfig> = {
      '#f-title':              'title',
      '#f-mode':               'mode',
      '#f-soc':                'battery_soc',
      '#f-power':              'battery_power',
      '#f-current':            'battery_current',
      '#f-voltage':            'battery_voltage',
      '#f-cell':               'battery_cell_first',
      '#f-device-id':          'device_id',
      '#f-show-last-updated':  'show_last_updated',
    };
    Object.entries(configKeys).forEach(([sel, key]) => {
      const el = this.querySelector<HaElement>(sel);
      if (el) el.configValue = key;
    });

    this._applyValues();

    this.querySelectorAll<HaElement>('ha-textfield').forEach(el => {
      el.addEventListener('change', ev => this._valueChanged(ev as Event));
    });
    // ha-select emette value-changed, non change
    this.querySelectorAll<HaElement>('ha-select').forEach(el => {
      el.addEventListener('value-changed', ev => this._valueChanged(ev as Event));
      el.addEventListener('closed', ev => ev.stopPropagation());
    });
    this.querySelectorAll<HaElement>('ha-entity-picker, ha-device-picker').forEach(el => {
      el.addEventListener('value-changed', ev => this._valueChanged(ev as Event));
    });
    this.querySelectorAll<HaElement>('ha-switch').forEach(el => {
      el.addEventListener('change', ev => this._valueChanged(ev as Event));
    });
  }

  private _applyValues(): void {
    if (!this._initialized || !this._config) return;
    this._updatingValues = true;
    const c = this._config;

    const setProp = (id: string, val: string | undefined): void => {
      const el = this.querySelector<HaElement>(id);
      if (el && el.value !== (val ?? '')) el.value = val ?? '';
    };

    setProp('#f-title',     c.title);
    setProp('#f-mode',      c.mode ?? 'extended');
    setProp('#f-soc',       c.battery_soc);
    setProp('#f-power',     c.battery_power);
    setProp('#f-current',   c.battery_current);
    setProp('#f-voltage',   c.battery_voltage);
    setProp('#f-cell',      c.battery_cell_first);
    setProp('#f-device-id', c.device_id);

    const sw = this.querySelector<HaElement>('#f-show-last-updated');
    if (sw) sw.checked = c.show_last_updated ?? false;

    if (this._hass) {
      this.querySelectorAll<HaElement>('ha-entity-picker, ha-device-picker').forEach(el => {
        el.hass = this._hass;
      });
    }

    // MWC elements (ha-select) can fire value-changed asynchronously after
    // value is set programmatically — keep the guard active for one RAF cycle
    requestAnimationFrame(() => { this._updatingValues = false; });
  }

  private _valueChanged(ev: Event): void {
    if (this._updatingValues) return;
    if (!this._config || !this._hass) return;
    const target = ev.target as HaElement;
    const configValue = target.configValue as keyof WecoBatteryConfig | undefined;
    if (!configValue) return;

    const detail = (ev as CustomEvent).detail;
    let value: string | boolean;
    if (target.tagName === 'HA-SWITCH') {
      value = !!target.checked;
    } else {
      value = detail?.value !== undefined ? detail.value : (target.value ?? '');
    }
    if (this._config[configValue] === value) return;

    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config, [configValue]: value } },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('weco-battery-card-editor', WecoBatteryCardEditor);


// ── Card principale ─────────────────────────────────────────────────────────
class WecoBatteryCard extends HTMLElement {
  config?: WecoBatteryConfig;
  private _hass?: HomeAssistant;
  private content?: HTMLElement;
  private titleEl?: HTMLElement;
  private lastUpdatedEl?: HTMLElement;

  static getConfigElement(): HTMLElement {
    return document.createElement('weco-battery-card-editor');
  }

  static getStubConfig(): WecoBatteryConfig {
    return { title: 'Batteria WECO', mode: 'extended' };
  }

  setConfig(config: WecoBatteryConfig): void {
    if (!config) throw new Error('Configurazione non valida');
    this.config = config;
    if (this._hass) this._render();
  }

  set hass(hass: HomeAssistant) {
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

          .minimal-row { display: flex; align-items: center; justify-content: space-between; background: rgba(128,128,128,0.08); padding: 14px 16px; border-radius: 8px; }
          .soc-big   { font-size: 2.4em; font-weight: bold; line-height: 1; }
          .soc-label { font-size: 0.7em; color: var(--secondary-text-color); text-transform: uppercase; margin-top: 4px; }
          .power-pill  { display: flex; flex-direction: column; align-items: flex-end; }
          .power-val   { font-size: 1.3em; font-weight: bold; }
          .power-label { font-size: 0.7em; color: var(--secondary-text-color); text-transform: uppercase; }

          .stats-row { display: grid; gap: 8px; background: rgba(128,128,128,0.08); padding: 12px 8px; border-radius: 8px; margin-bottom: 15px; }
          .stats-row.cols-3 { grid-template-columns: repeat(3, 1fr); }
          .stats-row.cols-4 { grid-template-columns: repeat(4, 1fr); }
          .stat        { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .stat-value  { font-size: 1.2em; font-weight: bold; white-space: nowrap; }
          .stat-label  { font-size: 0.7em; color: var(--secondary-text-color); text-transform: uppercase; margin-top: 4px; }

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
      this.content = this.querySelector<HTMLElement>('#content-area')!;
      this.titleEl = this.querySelector<HTMLElement>('#card-title')!;
      this.lastUpdatedEl = this.querySelector<HTMLElement>('#card-last-updated')!;
      this._setupClickHandler();
    }

    this._render();
  }

  private _setupClickHandler(): void {
    if (!this.content) return;
    this.content.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const clickable = target.closest('[data-entity]') as HTMLElement | null;
      if (!clickable) return;
      const entityId = clickable.dataset['entity'];
      if (!entityId) return;
      ev.stopPropagation();
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }));
    });
  }

  private _render(): void {
    if (!this.config || !this._hass) return;
    const config = this.config;
    const mode = config.mode ?? 'extended';

    // Titolo
    if (this.titleEl) {
      this.titleEl.textContent = config.title ?? 'Batteria WECO';
      if (config.device_id) {
        this.titleEl.classList.add('has-link');
        this.titleEl.onclick = () => this._navigateToDevice(config.device_id!);
      } else {
        this.titleEl.classList.remove('has-link');
        this.titleEl.onclick = null;
      }
    }

    const st = (id?: string): HassEntity | undefined => id ? this._hass!.states[id] : undefined;
    const soc     = st(config.battery_soc);
    const power   = st(config.battery_power);
    const current = st(config.battery_current);
    const voltage = st(config.battery_voltage);

    // Ultimo aggiornamento
    if (this.lastUpdatedEl) {
      if (config.show_last_updated) {
        const ref = soc ?? power ?? current ?? voltage;
        if (ref?.last_updated) {
          const d = new Date(ref.last_updated);
          this.lastUpdatedEl.textContent = `Aggiornato: ${d.toLocaleString()}`;
          this.lastUpdatedEl.style.display = '';
        } else {
          this.lastUpdatedEl.style.display = 'none';
        }
      } else {
        this.lastUpdatedEl.style.display = 'none';
      }
    }

    let html = '';

    if (mode === 'minimal') {
      const socEntity = config.battery_soc ? ` data-entity="${config.battery_soc}"` : '';
      const pwrEntity = config.battery_power ? ` data-entity="${config.battery_power}"` : '';
      html = `
        <div class="minimal-row">
          <div class="stat"${socEntity}>
            <div class="soc-big">${this._val(soc)}<span style="font-size:0.5em;font-weight:normal;">${this._unit(soc)}</span></div>
            <div class="soc-label">SOC</div>
          </div>
          <div class="power-pill"${pwrEntity}>
            <div class="power-val">${this._val(power)}${this._unit(power)}</div>
            <div class="power-label">Power</div>
          </div>
        </div>`;

    } else if (mode === 'basic') {
      html = `
        <div class="stats-row cols-3">
          ${this._stat(soc,     'SOC',     config.battery_soc)}
          ${this._stat(power,   'Power',   config.battery_power)}
          ${this._stat(current, 'Current', config.battery_current)}
        </div>`;

    } else {
      html = `
        <div class="stats-row cols-4">
          ${this._stat(soc,     'SOC',     config.battery_soc)}
          ${this._stat(power,   'Power',   config.battery_power)}
          ${this._stat(current, 'Current', config.battery_current)}
          ${this._stat(voltage, 'Voltage', config.battery_voltage)}
        </div>`;

      const firstCell = config.battery_cell_first;
      if (firstCell) {
        const m = firstCell.match(/^(.+?)(\d+)$/);
        if (m) {
          const base   = m[1];
          const digits = m[2].length;

          interface CellData { n: string; id: string; v: number; b: boolean; }
          const cells: CellData[] = [];

          for (let i = 1; i <= 16; i++) {
            const n   = i.toString().padStart(digits, '0');
            const vId = `${base}${n}`;
            const bId = vId.replace(/^sensor\./, 'binary_sensor.') + '_balance';
            const v   = this._hass!.states[vId];
            const b   = this._hass!.states[bId];
            if (v) cells.push({ n, id: vId, v: parseFloat(v.state), b: b?.state === 'on' });
          }

          if (cells.length > 0) {
            const vals = cells.map(c => c.v).filter(v => !isNaN(v));
            const maxV = Math.max(...vals);
            const minV = Math.min(...vals);

            html += `<div class="cell-grid">`;
            cells.forEach(c => {
              const isMax = vals.length > 1 && c.v === maxV;
              const isMin = vals.length > 1 && c.v === minV;
              const cls   = isMax ? 'volt-highest' : (isMin ? 'volt-lowest' : '');
              html += `
                <div class="cell-box ${c.b ? 'is-balancing' : ''}" data-entity="${c.id}">
                  <div class="cell-name">C${c.n}</div>
                  <div class="cell-volt ${cls}">${isNaN(c.v) ? '---' : c.v.toFixed(3)}</div>
                  ${c.b ? '<div class="cell-balance">▲ bal</div>' : ''}
                </div>`;
            });
            html += `</div>`;
          }
        }
      }
    }

    if (this.content) this.content.innerHTML = html;
  }

  private _navigateToDevice(deviceId: string): void {
    const url = `/config/devices/device/${deviceId}`;
    window.history.pushState({ path: url }, '', url);
    window.dispatchEvent(new CustomEvent('location-changed', {
      detail: { replace: false },
    }));
  }

  private _val(entity?: HassEntity): string {
    return entity ? entity.state : '---';
  }

  private _unit(entity?: HassEntity): string {
    return (entity?.attributes?.unit_of_measurement as string) ?? '';
  }

  private _stat(entity: HassEntity | undefined, label: string, entityId?: string): string {
    const attr = entityId ? ` data-entity="${entityId}"` : '';
    return `<div class="stat"${attr}>
      <span class="stat-value">${this._val(entity)}${this._unit(entity)}</span>
      <span class="stat-label">${label}</span>
    </div>`;
  }

  getCardSize(): number {
    const m = this.config?.mode;
    return m === 'minimal' ? 2 : m === 'basic' ? 3 : 8;
  }
}

customElements.define('weco-battery-card', WecoBatteryCard);
