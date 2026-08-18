export type ProductCategory =
  'PANEL' | 'KIT' | 'INVERSOR' | 'BATERIA' | 'RESPALDO' | 'ILUMINACION' | 'ACCESORIO';

export type AgentProduct = {
  id: string;
  sku: string;
  name: string;
  model: string;
  category: ProductCategory;
  description: string;
  specs: string[];
  priceUsd: string;
  priceCup: string;
  imagePath: string;
  inStock: boolean;
  isNew: boolean;
  sortOrder: number;
  keywords: string[];
};

export type DeliveryZone = {
  id: string;
  province: string;
  municipality: string;
};

export const SEED_PRODUCTS: AgentProduct[] = [
  {
    id: 'prod_panel_550',
    sku: 'EGX-P550',
    name: 'Panel solar monocristalino',
    model: 'Energix 550W N-Type',
    category: 'PANEL',
    description:
      'Panel de alta eficiencia para techos residenciales. Ideal para ampliar un sistema existente o armar un kit nuevo.',
    specs: [
      '550 W pico, celdas N-Type',
      'Eficiencia aproximada 22.5%',
      'Voltaje de operación 41.5 V',
      'Marco de aluminio y vidrio templado',
    ],
    priceUsd: '85',
    priceCup: '29750',
    imagePath: '/catalog/panel-550.jpg',
    inStock: true,
    isNew: true,
    sortOrder: 10,
    keywords: ['panel', 'placa', '550', 'solar', 'monocristalino', 'n-type'],
  },
  {
    id: 'prod_panel_450',
    sku: 'EGX-P450',
    name: 'Panel solar monocristalino',
    model: 'Energix 450W',
    category: 'PANEL',
    description: 'Panel compacto para balcones, ranchos o sistemas de menor consumo.',
    specs: [
      '450 W pico',
      'Eficiencia aproximada 21%',
      'Buen rendimiento con calor',
      'Garantía de potencia 25 años',
    ],
    priceUsd: '70',
    priceCup: '24500',
    imagePath: '/catalog/panel-450.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 20,
    keywords: ['panel', 'placa', '450', 'solar', 'compacto'],
  },
  {
    id: 'prod_kit_1kw',
    sku: 'EGX-K1K',
    name: 'Kit solar residencial',
    model: 'Energix Home 1.1 kW',
    category: 'KIT',
    description: 'Kit listo para alumbrado, TV, abanicos y carga de celulares durante apagones.',
    specs: [
      '2 paneles 550 W',
      'Inversor 1.2 kW 12/24 V',
      'Cables, conectores MC4 y breaker',
      'No incluye batería (se vende aparte)',
    ],
    priceUsd: '320',
    priceCup: '112000',
    imagePath: '/catalog/kit-1kw.jpg',
    inStock: true,
    isNew: true,
    sortOrder: 30,
    keywords: ['kit', '1kw', '1.1', 'residencial', 'hogar', 'combo'],
  },
  {
    id: 'prod_kit_3kw',
    sku: 'EGX-K3K',
    name: 'Kit solar con respaldo',
    model: 'Energix Power 3.3 kW + 5 kWh',
    category: 'KIT',
    description:
      'Solución completa para nevera, bombas, TV y varias lámparas con batería de litio.',
    specs: [
      '6 paneles 550 W',
      'Inversor híbrido 3.5 kW 24 V',
      'Batería LiFePO4 5 kWh',
      'Estructura de techo y cableado',
    ],
    priceUsd: '1450',
    priceCup: '507500',
    imagePath: '/catalog/kit-3kw.jpg',
    inStock: true,
    isNew: true,
    sortOrder: 40,
    keywords: ['kit', '3kw', '3.3', 'completo', 'respaldo', 'nevera'],
  },
  {
    id: 'prod_inv_35',
    sku: 'EGX-I35',
    name: 'Inversor híbrido',
    model: 'Energix Hybrid 3.5 kW 24V',
    category: 'INVERSOR',
    description:
      'Inversor con cargador y MPPT para sistemas de 24 V. Soporta red + solar + batería.',
    specs: ['3500 W continuos', 'MPPT 100 A', 'Entrada PV hasta 500 V', 'Salida 110/220 V'],
    priceUsd: '280',
    priceCup: '98000',
    imagePath: '/catalog/inversor-35.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 50,
    keywords: ['inversor', 'hibrido', 'híbrido', '3.5', '3500', '24v'],
  },
  {
    id: 'prod_inv_62',
    sku: 'EGX-I62',
    name: 'Inversor híbrido',
    model: 'Energix Hybrid 6.2 kW 48V',
    category: 'INVERSOR',
    description: 'Para casas con mayor carga: split, nevera y bomba al mismo tiempo.',
    specs: ['6200 W continuos', 'Doble MPPT', '48 V', 'Pantalla y Wi-Fi opcional'],
    priceUsd: '420',
    priceCup: '147000',
    imagePath: '/catalog/inversor-62.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 60,
    keywords: ['inversor', 'hibrido', 'híbrido', '6.2', '6200', '48v'],
  },
  {
    id: 'prod_bat_100',
    sku: 'EGX-B100',
    name: 'Batería LiFePO4',
    model: 'Energix LFP 12V 100Ah',
    category: 'BATERIA',
    description: 'Batería de litio para inversores pequeños, lámparas y estaciones portátiles.',
    specs: [
      '12 V 100 Ah (1.28 kWh)',
      'Más de 4000 ciclos',
      'BMS integrado',
      'Peso aproximado 11 kg',
    ],
    priceUsd: '180',
    priceCup: '63000',
    imagePath: '/catalog/bateria-100.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 70,
    keywords: ['bateria', 'batería', 'lifepo', '12v', '100ah', 'litio'],
  },
  {
    id: 'prod_bat_200',
    sku: 'EGX-B200',
    name: 'Batería LiFePO4',
    model: 'Energix LFP 24V 200Ah',
    category: 'BATERIA',
    description: 'Respaldo medio para nevera y alumbrado durante varias horas de apagón.',
    specs: [
      '24 V 200 Ah (5.12 kWh)',
      'BMS con protección térmica',
      'Paralelo hasta 4 unidades',
      'Ciclo profundo',
    ],
    priceUsd: '480',
    priceCup: '168000',
    imagePath: '/catalog/bateria-200.jpg',
    inStock: true,
    isNew: true,
    sortOrder: 80,
    keywords: ['bateria', 'batería', 'lifepo', '24v', '200ah', '5kwh'],
  },
  {
    id: 'prod_bat_48',
    sku: 'EGX-B48',
    name: 'Batería LiFePO4 rack',
    model: 'Energix LFP 48V 5.12 kWh',
    category: 'BATERIA',
    description:
      'Módulo rack para inversores 48 V. Se puede apilar según la autonomía que necesites.',
    specs: [
      '51.2 V 100 Ah',
      'Comunicación CAN/RS485',
      'Diseño rack 3U',
      'Alta densidad energética',
    ],
    priceUsd: '650',
    priceCup: '227500',
    imagePath: '/catalog/bateria-48.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 90,
    keywords: ['bateria', 'batería', 'rack', '48v', '5kwh', 'modulo'],
  },
  {
    id: 'prod_mppt_60',
    sku: 'EGX-M60',
    name: 'Controlador MPPT',
    model: 'Energix MPPT 60A',
    category: 'ACCESORIO',
    description:
      'Regulador MPPT para cargar bancos de 12/24/48 V con mejor aprovechamiento que PWM.',
    specs: ['60 A', '12/24/48 V auto', 'Pantalla LCD', 'Protección contra sobrecarga'],
    priceUsd: '75',
    priceCup: '26250',
    imagePath: '/catalog/mppt-60.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 100,
    keywords: ['mppt', 'controlador', 'regulador', '60a'],
  },
  {
    id: 'prod_lamp_50',
    sku: 'EGX-L50',
    name: 'Lámpara solar portátil',
    model: 'Energix Light 50W',
    category: 'ILUMINACION',
    description: 'Foco recargable con panel plegable. Útil para patios, guardia o apagones.',
    specs: ['50 W LED', 'Batería interna', 'USB para cargar el móvil', 'Control remoto'],
    priceUsd: '28',
    priceCup: '9800',
    imagePath: '/catalog/lampara-50.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 110,
    keywords: ['lampara', 'lámpara', 'foco', 'luz', 'portatil', '50w'],
  },
  {
    id: 'prod_station_1k',
    sku: 'EGX-PS1K',
    name: 'Estación de respaldo',
    model: 'Energix Station 1000Wh',
    category: 'RESPALDO',
    description:
      'Power station lista para usar: no requiere instalación. Ideal para laptops, módem y nevera mini.',
    specs: ['1024 Wh LiFePO4', 'Salida AC 1000 W', 'USB-C PD 100 W', 'Carga solar o de red'],
    priceUsd: '220',
    priceCup: '77000',
    imagePath: '/catalog/station-1000.jpg',
    inStock: true,
    isNew: true,
    sortOrder: 120,
    keywords: ['estacion', 'estación', 'power station', 'respaldo', 'portatil', '1000'],
  },
  {
    id: 'prod_cable_6',
    sku: 'EGX-C6',
    name: 'Cable solar',
    model: 'PV1-F 6 mm 20 m',
    category: 'ACCESORIO',
    description: 'Tramo de 20 metros de cable solar rojo/negro con conectores MC4.',
    specs: ['6 mm²', '20 metros', 'MC4 incluidos', 'Aislamiento UV'],
    priceUsd: '22',
    priceCup: '7700',
    imagePath: '/catalog/cable-solar.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 130,
    keywords: ['cable', 'mc4', '6mm', 'alambre'],
  },
  {
    id: 'prod_rack_4',
    sku: 'EGX-R4',
    name: 'Estructura de techo',
    model: 'Energix Roof 4P',
    category: 'ACCESORIO',
    description: 'Rieles y grapas para fijar hasta 4 paneles en teja o losa.',
    specs: ['Hasta 4 paneles', 'Aluminio anodizado', 'Tornillería inox', 'Inclinación ajustable'],
    priceUsd: '45',
    priceCup: '15750',
    imagePath: '/catalog/estructura.jpg',
    inStock: true,
    isNew: false,
    sortOrder: 140,
    keywords: ['estructura', 'riel', 'soporte', 'techo', 'rack techo'],
  },
];

export const SEED_ZONES: DeliveryZone[] = [
  ['habana', 'Playa'],
  ['habana', 'Plaza de la Revolución'],
  ['habana', 'Centro Habana'],
  ['habana', 'Habana Vieja'],
  ['habana', 'Cerro'],
  ['habana', 'Diez de Octubre'],
  ['habana', 'Marianao'],
  ['habana', 'La Lisa'],
  ['habana', 'Boyeros'],
  ['habana', 'Arroyo Naranjo'],
  ['habana', 'San Miguel del Padrón'],
  ['habana', 'Cotorro'],
  ['habana', 'Guanabacoa'],
  ['habana', 'Habana del Este'],
  ['habana', 'Regla'],
  ['matanzas', 'Matanzas'],
  ['matanzas', 'Cárdenas'],
  ['matanzas', 'Varadero'],
  ['villa-clara', 'Santa Clara'],
  ['pinar', 'Pinar del Río'],
  ['artemisa', 'Artemisa'],
  ['mayabeque', 'San José de las Lajas'],
  ['camaguey', 'Camagüey'],
  ['santiago', 'Santiago de Cuba'],
].map(([province, municipality], index) => ({
  id: `zone_${index + 1}`,
  province: province ?? 'habana',
  municipality: municipality ?? 'Playa',
}));

export function productLabel(product: AgentProduct): string {
  return `${product.name} ${product.model}`;
}

export function formatUsd(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `$${value} USD`;
  return `$${amount.toLocaleString('en-US')} USD`;
}

export function formatCup(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} CUP`;
  return `${amount.toLocaleString('en-US')} CUP`;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findProducts(catalog: AgentProduct[], query: string): AgentProduct[] {
  const needle = normalizeText(query);
  if (!needle) return [];
  const scored = catalog
    .map((product) => {
      const haystack = normalizeText(
        [
          product.name,
          product.model,
          product.sku,
          product.category,
          product.description,
          ...product.keywords,
        ].join(' '),
      );
      let score = 0;
      if (haystack.includes(needle)) score += 8;
      for (const token of needle.split(' ')) {
        if (token.length < 3) continue;
        if (haystack.includes(token)) score += 2;
        if (product.keywords.some((keyword) => normalizeText(keyword).includes(token))) score += 2;
      }
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.product.sortOrder - right.product.sortOrder,
    );
  return scored.map((entry) => entry.product);
}

export function findZoneMentions(zones: DeliveryZone[], text: string): DeliveryZone[] {
  const needle = normalizeText(text);
  return zones.filter((zone) => {
    const municipality = normalizeText(zone.municipality);
    const province = normalizeText(zone.province.replace('-', ' '));
    return needle.includes(municipality) || needle.includes(province);
  });
}
