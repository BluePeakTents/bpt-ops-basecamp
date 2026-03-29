import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPatch, dvPost } from '../hooks/useDataverse'
import { isoDate } from '../utils/dateUtils'

/* ── Constants ─────────────────────────────────────────────────── */
// Category counts auto-calculated from FLEET_VEHICLES below
const FLEET_CATEGORIES = [
  { key: 'pickup', label: 'Pickups', icon: '🛻' },
  { key: 'box16', label: '16\' Box Trucks', icon: '📦' },
  { key: 'box26', label: '26\' Box Trucks', icon: '🚛' },
  { key: 'flatbed', label: 'Flatbed/Stakebed', icon: '🚚' },
  { key: 'semi', label: 'Semi Tractor', icon: '🚜' },
  { key: 'trailer', label: 'Trailers', icon: '📐' },
  { key: 'passenger', label: 'Passenger', icon: '🚐' },
  { key: 'forklift', label: 'Forklifts', icon: '🏗️' },
  { key: 'ox', label: 'Oxes (Loaders)', icon: '⚙️' },
  { key: 'generator', label: 'Generators', icon: '⚡' },
]

const STATUS_OPTIONS = ['Active', 'In Shop', 'Out of Service', 'Purchasing', 'On Order', 'Needs Registration']

function mapVehicle(v) {
  return {
    unit: v.cr55d_unitnumber || v.cr55d_name || '',
    category: (v.cr55d_category || '').toLowerCase(),
    make: v.cr55d_make || '', model: v.cr55d_model || '', year: v.cr55d_year || 0,
    plate: v.cr55d_plate || '', vin: v.cr55d_vin || '', fuel: v.cr55d_fuel || '',
    dot: !!v.cr55d_dot, cdl: !!v.cr55d_cdl, ownership: v.cr55d_ownership || 'Owned',
    status: v.cr55d_status || 'Active', state: v.cr55d_state || '', notes: v.cr55d_notes || '',
    driver: v.cr55d_driver || '', odometer: v.cr55d_odometer || 0,
    lessor: v.cr55d_lessor || '', monthlyLease: v.cr55d_monthlylease || 0,
    leaseStart: v.cr55d_leasestart || '', leaseEnd: v.cr55d_leaseend || '',
    mileageAllowance: v.cr55d_mileageallowance || 0, _id: v.cr55d_vehicleid,
  }
}
const STATUS_BADGE_MAP = { 'Active': 'badge-green', 'In Shop': 'badge-amber', 'Out of Service': 'badge-red', 'Purchasing': 'badge-blue', 'On Order': 'badge-purple', 'Needs Registration': 'badge-sand' }

const FLEET_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'master', label: 'Fleet Master' },
  { id: 'lease', label: 'Lease & Financials' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'fuel', label: 'Fuel & Costs' },
  { id: 'utilization', label: 'Utilization' },
  { id: 'condition', label: 'Condition' },
]

// ─── REAL FLEET DATA (from Blue Peak Fleet Master spreadsheet) ─────
const FLEET_VEHICLES = [
  // Pickups
  { unit:'250',category:'pickup',make:'Ford',model:'F-250',year:2013,plate:'433668D',status:'Active',vin:'1FT7W2BT5DEB19543',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'251',category:'pickup',make:'Ford',model:'F-250',year:2014,plate:'386921D',status:'Active',vin:'1FT7W2BT1EEB65811',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'252',category:'pickup',make:'Ford',model:'F-250',year:2020,plate:'475773D',status:'In Shop',vin:'1FT7W2BT9LED83301',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',notes:'At PMS for transfer case'},
  { unit:'253',category:'pickup',make:'Ford',model:'F-250',year:2019,plate:'475774D',status:'Active',vin:'1FT7W2BT0KED25804',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'254',category:'pickup',make:'Ford',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'255',category:'pickup',make:'Ford',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'256',category:'pickup',make:'Ford',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'257',category:'pickup',make:'Ford',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'258',category:'pickup',make:'Ford',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'350',category:'pickup',make:'Ford',model:'F-350',year:2019,plate:'467182D',status:'Active',vin:'1FT8W3BT0KED61826',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'2501',category:'pickup',make:'Ram',model:'2500',year:2021,plate:'475977D',status:'Active',vin:'3C6UR5DL5MG630792',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'2502',category:'pickup',make:'Ram',model:'2500',year:2022,plate:'528590D',status:'Active',vin:'3C6UR5CL4NG361980',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'Kevin',category:'pickup',make:'Ford',model:'F-250',year:2023,plate:'',status:'Active',vin:'1FT8W2BM3PFD15157',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'Jake',category:'pickup',make:'Ford',model:'F-250',year:2022,plate:'',status:'Active',vin:'1FT7W2BT7NED35119',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  // 16' Box Trucks
  { unit:'BP1',category:'box16',make:'Isuzu',model:'NPR-XD',year:2017,plate:'103866F',status:'Active',vin:'JALC4J161H7K00736',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'BP2',category:'box16',make:'Isuzu',model:'NPR-HD',year:2022,plate:'188400F',status:'Active',vin:'JALC4W165N7015842',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  { unit:'BP3',category:'box16',make:'Chevy',model:'4500',year:2022,plate:'184296F',status:'Active',vin:'JALCDW163N7K02206',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL'},
  // 26' Box Trucks (C-Class)
  { unit:'B1',category:'box26',make:'Freightliner',model:'M2',year:2018,plate:'',status:'Active',vin:'3ALACWFC2JDK7166',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'B2',category:'box26',make:'Freightliner',model:'M2',year:2017,plate:'1804994H',status:'Active',vin:'3ALACWDT0HDJC0595',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  { unit:'B3',category:'box26',make:'Freightliner',model:'M2',year:2017,plate:'203044H',status:'Active',vin:'3ALACWDT5HHDJB2914',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  { unit:'B4',category:'box26',make:'International',model:'MVCA',year:2021,plate:'195916H',status:'Active',vin:'3HAEUMML7ML551926',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'B5',category:'box26',make:'International',model:'MVCA',year:2022,plate:'195914H',status:'Active',vin:'1HTEUMML5NH510393',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'B6',category:'box26',make:'International',model:'MVCA',year:2022,plate:'195915H',status:'Active',vin:'3HAEUMML5NL551925',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'B7',category:'box26',make:'International',model:'MVCA',year:2023,plate:'',status:'Active',vin:'3HAEUMML2PL601392',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'B8',category:'box26',make:'Hino',model:'L6',year:2023,plate:'3354041',status:'Active',vin:'5PVNJ7AV7P5T53158',fuel:'Diesel',dot:true,ownership:'Leased',state:'IN',cdl:true},
  { unit:'B9',category:'box26',make:'International',model:'MV607',year:2022,plate:'3172727',status:'Active',vin:'3HAEUMML2NL485771',fuel:'Diesel',dot:true,ownership:'Leased',state:'IN',cdl:true},
  { unit:'B10',category:'box26',make:'International',model:'MV607',year:2022,plate:'3171023',status:'Active',vin:'3HAEUMML5NL485764',fuel:'Diesel',dot:true,ownership:'Leased',state:'IN',cdl:true},
  { unit:'650',category:'box26',make:'Ford',model:'F-650',year:2017,plate:'159911H',status:'Active',vin:'1FDNW6DCXHDB08514',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  // Stakebeds / Flatbeds (C-Class)
  { unit:'F1',category:'flatbed',make:'International',model:'MVCA',year:2021,plate:'225738H',status:'Active',vin:'3HAEUMML4ML420631',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'F2',category:'flatbed',make:'International',model:'MVCA',year:2021,plate:'179996H',status:'Active',vin:'3HAEUMML0ML420769',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'F3',category:'flatbed',make:'Freightliner',model:'M2',year:2018,plate:'229822H',status:'Out of Service',vin:'3ALACWFC7JDKA1743',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true,notes:'Accident Damage — State Farm covering 100%'},
  { unit:'F4',category:'flatbed',make:'',model:'',year:0,plate:'FP 305196',status:'Active',vin:'',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  { unit:'651',category:'flatbed',make:'Ford',model:'F-650',year:2018,plate:'222085H',status:'Active',vin:'1FDNF6DC1JDF06566',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  // Stakebeds (B-Class)
  { unit:'750',category:'flatbed',make:'Ford',model:'F-750',year:2019,plate:'P1263484',status:'Active',vin:'1FDNXF7DCDKDF00127',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  { unit:'751',category:'flatbed',make:'Ford',model:'F-750',year:2019,plate:'',status:'Active',vin:'1FDXF7DE4KDF15859',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  { unit:'Tandem',category:'flatbed',make:'Freightliner',model:'M2',year:2025,plate:'P1261225',status:'Active',vin:'3ALHCHYE9SDVS6122',fuel:'Diesel',dot:true,ownership:'Leased',state:'IL',cdl:true},
  // Semi
  { unit:'S1',category:'semi',make:'Freightliner',model:'Cascadia',year:2017,plate:'P1208169',status:'Active',vin:'3AKJGEDV3HDHY1419',fuel:'Diesel',dot:true,ownership:'Owned',state:'IL',cdl:true},
  // Passenger
  { unit:'Sonata',category:'passenger',make:'Hyundai',model:'Sonata',year:2012,plate:'',status:'Out of Service',vin:'5NPEC4AB7CH413383',fuel:'Gas',dot:true,ownership:'Owned',state:'IL',notes:'Hard starting / no registration'},
  { unit:'V1',category:'passenger',make:'Ford',model:'E-350 Van',year:2013,plate:'',status:'Active',vin:'1FBSS3BL9DDA05065',fuel:'Gas',dot:true,ownership:'Owned',state:'IL'},
  { unit:'V2',category:'passenger',make:'Chrysler',model:'Town & Country',year:2016,plate:'',status:'Active',vin:'2C4RC1BG9GR142684',fuel:'Gas',dot:true,ownership:'Owned',state:'IL'},
  // Trailers
  { unit:'ST1',category:'trailer',make:'Fontaine',model:'Velocity 48\' Step Deck',year:2023,plate:'901 730 ST',status:'Active',vin:'13N248206P1552093',fuel:'N/A',dot:true,ownership:'Owned'},
  { unit:'ST2',category:'trailer',make:'',model:'Step Deck',year:0,plate:'',status:'Needs Registration',vin:'',fuel:'N/A',dot:true,ownership:'Owned',notes:'Needs permanent plate'},
  { unit:'ST3',category:'trailer',make:'',model:'Step Deck',year:0,plate:'',status:'Needs Registration',vin:'',fuel:'N/A',dot:true,ownership:'Owned',notes:'Needs permanent plate'},
  { unit:'T1',category:'trailer',make:'PJ Trailers',model:'Flatbed',year:2015,plate:'28458TE',status:'Active',vin:'4P5CC2021F3013029',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T2',category:'trailer',make:'H&H Trailer',model:'Flatbed',year:2023,plate:'',status:'Active',vin:'5JWUF2223PN575260',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T3',category:'trailer',make:'Eagle Trailer',model:'Flatbed',year:2020,plate:'115646TE',status:'Active',vin:'4ETF72027L1006663',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T4',category:'trailer',make:'Eagle Trailer',model:'Flatbed',year:2021,plate:'130467TE',status:'Active',vin:'4ETF7202XM1006769',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T5',category:'trailer',make:'Rice Trailer',model:'Flatbed',year:2023,plate:'137576TE',status:'Active',vin:'4RWBE2023PH048571',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T6',category:'trailer',make:'Rice Trailer',model:'Flatbed',year:2023,plate:'140041TE',status:'Active',vin:'4RWBE2025PH049978',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T7',category:'trailer',make:'Rice Trailer',model:'Flatbed',year:2026,plate:'',status:'Active',vin:'',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T8',category:'trailer',make:'Rice Trailer',model:'Flatbed',year:2026,plate:'',status:'Active',vin:'',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T9',category:'trailer',make:'Rice Trailer',model:'Flatbed',year:2026,plate:'',status:'Active',vin:'',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  { unit:'T10',category:'trailer',make:'Rice Trailer',model:'Flatbed',year:2026,plate:'',status:'Active',vin:'',fuel:'N/A',dot:true,ownership:'Owned',state:'IL'},
  // Articulating Loaders (Oxes)
  { unit:'OX1',category:'ox',make:'Avant',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX2',category:'ox',make:'Avant',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX3',category:'ox',make:'Avant',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX4',category:'ox',make:'Avant',model:'755',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX5',category:'ox',make:'Avant',model:'860',year:0,plate:'',status:'Out of Service',vin:'',fuel:'Diesel',dot:false,ownership:'Owned',notes:'Bad ECU. Scheduled to be worked on'},
  { unit:'OX6',category:'ox',make:'Avant',model:'855',year:2025,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX7',category:'ox',make:'Avant',model:'755',year:2025,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX8',category:'ox',make:'Avant',model:'755',year:2025,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX9',category:'ox',make:'Avant',model:'755',year:2025,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'OX10',category:'ox',make:'Avant',model:'755',year:2025,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'Giant',category:'ox',make:'Giant',model:'',year:0,plate:'',status:'Active',vin:'',fuel:'Diesel',dot:false,ownership:'Owned'},
  // Forklifts
  { unit:'CAT',category:'forklift',make:'CAT',model:'Forklift',year:0,plate:'',status:'Active',vin:'',fuel:'Propane',dot:false,ownership:'Owned'},
  { unit:'Hyundai 1',category:'forklift',make:'Hyundai',model:'Forklift',year:0,plate:'',status:'Active',vin:'',fuel:'Propane',dot:false,ownership:'Owned'},
  { unit:'Hyundai 2',category:'forklift',make:'Hyundai',model:'Forklift',year:0,plate:'',status:'Active',vin:'',fuel:'Propane',dot:false,ownership:'Owned'},
  { unit:'Crown 1',category:'forklift',make:'Crown',model:'C5P',year:0,plate:'',status:'On Order',vin:'',fuel:'Propane',dot:false,ownership:'Owned',notes:'Ordered'},
  { unit:'Crown 2',category:'forklift',make:'Crown',model:'C5P',year:0,plate:'',status:'On Order',vin:'',fuel:'Propane',dot:false,ownership:'Owned',notes:'Ordered'},
  // Generators
  { unit:'MQ-20KW-1',category:'generator',make:'MQ Power',model:'TRLR25US2',year:2020,plate:'',status:'Active',vin:'4GNBG0917LB055480',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'MQ-20KW-2',category:'generator',make:'MQ Power',model:'TRLR25US2',year:2020,plate:'',status:'Active',vin:'4GNBG0910LB055479',fuel:'Diesel',dot:false,ownership:'Owned'},
  { unit:'MQ-20KW-3',category:'generator',make:'MQ Power',model:'TRLR25US2',year:2020,plate:'',status:'Active',vin:'4GNB3089758',fuel:'Diesel',dot:false,ownership:'Owned'},
]

// ─── REAL LEASE DATA (from Fleet Master - Lease & Financials tab) ─────
const LEASE_DATA = [
  { unit:'B1',lessor:'Penske',type:'26\' Box C-Class',monthly:1719.89,start:'2026-04-01',end:'',term:36,mileageAllowance:20000,currentMiles:0},
  { unit:'B8',lessor:'Penske',type:'26\' Box C-Class',monthly:1827.00,start:'2025-01-06',end:'',term:57,mileageAllowance:20000,currentMiles:0},
  { unit:'B9',lessor:'Penske',type:'26\' Box C-Class',monthly:1719.89,start:'2025-03-27',end:'',term:42,mileageAllowance:20000,currentMiles:0},
  { unit:'B10',lessor:'Penske',type:'26\' Box C-Class',monthly:1719.89,start:'2025-04-02',end:'',term:0,mileageAllowance:20000,currentMiles:0},
  { unit:'F1',lessor:'Enterprise',type:'26\' Stakebed C-Class',monthly:1400.00,start:'2022-03-01',end:'2027-03-01',term:60,mileageAllowance:24000,currentMiles:0,excessRate:0.10},
  { unit:'F2',lessor:'Enterprise',type:'26\' Stakebed C-Class',monthly:1400.00,start:'2022-03-01',end:'2027-03-01',term:60,mileageAllowance:24000,currentMiles:0,excessRate:0.10},
  { unit:'F3',lessor:'Enterprise',type:'26\' Stakebed C-Class',monthly:1400.00,start:'2022-03-01',end:'2027-03-01',term:60,mileageAllowance:24000,currentMiles:0,excessRate:0.10},
  { unit:'B4',lessor:'Enterprise',type:'26\' Box C-Class',monthly:1400.00,start:'2022-03-01',end:'2027-03-01',term:60,mileageAllowance:24000,currentMiles:0,excessRate:0.10},
  { unit:'B5',lessor:'Enterprise',type:'26\' Box C-Class',monthly:1400.00,start:'2022-03-01',end:'2027-03-01',term:60,mileageAllowance:24000,currentMiles:0,excessRate:0.10},
  { unit:'B6',lessor:'Enterprise',type:'26\' Box C-Class',monthly:1400.00,start:'2022-03-01',end:'2027-03-01',term:60,mileageAllowance:24000,currentMiles:0,excessRate:0.10},
  { unit:'B7',lessor:'Enterprise',type:'26\' Box C-Class',monthly:1565.00,start:'2023-04-20',end:'',term:0,mileageAllowance:24000,currentMiles:0,excessRate:0.11},
  { unit:'Tandem',lessor:'TransChicago',type:'26\' Stakebed B-Class',monthly:3160.16,start:'2025-07-25',end:'2031-07-25',term:72,mileageAllowance:25000,currentMiles:0,buyout:40000},
]

/* ── Main Component ────────────────────────────────────────────── */
export default function Fleet() {
  const [subTab, setSubTab] = useState('dashboard')
  const [vehicles, setVehicles] = useState(FLEET_VEHICLES)
  const [leaseData, setLeaseData] = useState(LEASE_DATA)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [toast, setToast] = useState(null)
  const [dataSource, setDataSource] = useState('local') // 'local' or 'dataverse'

  // Load from Dataverse on mount — fall back to hardcoded if unavailable
  useEffect(() => {
    async function loadFleet() {
      try {
        const data = await dvFetch('cr55d_vehicles?$orderby=cr55d_unitnumber asc&$top=500')
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(mapVehicle)
          setVehicles(mapped)
          setDataSource('dataverse')

          // Build lease data from vehicles with lease info
          const leases = mapped.filter(v => v.lessor && v.monthlyLease > 0).map(v => ({
            unit: v.unit, lessor: v.lessor, type: `${v.make} ${v.model}`.trim(),
            monthly: v.monthlyLease, start: v.leaseStart, end: v.leaseEnd,
            term: 0, mileageAllowance: v.mileageAllowance, currentMiles: v.odometer,
          }))
          if (leases.length > 0) setLeaseData(leases)
        }
      } catch (e) {
        console.log('[Fleet] Dataverse load failed, using local data:', e.message)
      }
    }
    loadFleet()
  }, [])

  // Dynamic category counts
  const categoryCounts = {}
  FLEET_CATEGORIES.forEach(c => { categoryCounts[c.key] = vehicles.filter(v => v.category === c.key).length })

  const activeCount = vehicles.filter(v => v.status === 'Active').length
  const shopCount = vehicles.filter(v => v.status === 'In Shop').length
  const oosCount = vehicles.filter(v => v.status === 'Out of Service').length
  const onOrderCount = vehicles.filter(v => v.status === 'On Order').length
  const ownedCount = vehicles.filter(v => v.ownership === 'Owned').length
  const leasedCount = vehicles.filter(v => v.ownership === 'Leased').length
  const totalMonthlyLease = leaseData.reduce((s, l) => s + l.monthly, 0)

  const filteredVehicles = vehicles.filter(v => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false
    if (categoryFilter !== 'all' && v.category !== categoryFilter) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return v.unit.toLowerCase().includes(q) || v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || (v.driver || '').toLowerCase().includes(q)
    }
    return true
  })

  async function updateStatus(unitId, newStatus) {
    // Capture vehicle ID before optimistic update to avoid stale closure
    const vehicle = vehicles.find(v => v.unit === unitId)
    const vehicleId = vehicle?._id
    setVehicles(p => p.map(v => v.unit === unitId ? { ...v, status: newStatus } : v))
    if (dataSource === 'dataverse' && vehicleId) {
      try {
        await dvPatch(`cr55d_vehicles(${vehicleId})`, { cr55d_status: newStatus })
      } catch (e) {
        console.error('[Fleet] Status update failed:', e)
        // Rollback using functional update
        setVehicles(p => p.map(v => v.unit === unitId ? { ...v, status: vehicle.status } : v))
      }
    }
  }

  function exportFleetCSV() {
    const headers = ['Unit','Category','Make','Model','Year','Plate','VIN','Fuel','DOT','CDL','Ownership','Status','State','Notes']
    const rows = filteredVehicles.map(v => [
      v.unit, v.category, v.make, v.model, v.year || '', v.plate, v.vin, v.fuel,
      v.dot ? 'Yes' : 'No', v.cdl ? 'Yes' : 'No', v.ownership, v.status, v.state || '', v.notes || ''
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fleet-export-${isoDate(new Date().toISOString())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Fleet</h1><div className="sub">Vehicle management — {vehicles.length} units</div><div className="page-head-accent"></div></div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={exportFleetCSV}>📥 Export</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setSubTab('master'); setSearchTerm(''); setCategoryFilter('all'); setStatusFilter('all'); setSelectedVehicle({ _isNew: true, unit: '', category: 'pickup', make: '', model: '', year: new Date().getFullYear(), plate: '', status: 'Active', vin: '', fuel: 'Diesel', dot: false, ownership: 'Owned' }) }}>+ Add Vehicle</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-6 mb-16">
        {FLEET_TABS.map(t => (
          <button key={t.id} className={`pill${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Dashboard */}
      {subTab === 'dashboard' && (
        <div className="animate-in">
          <div className="kpi-row">
            <div className="kpi"><div className="kpi-icon">✅</div><div className="kpi-label">Active</div><div className="kpi-val" style={{color:'var(--bp-green)'}}>{activeCount}</div><div className="kpi-sub">road-ready</div></div>
            <div className="kpi"><div className="kpi-icon">🔧</div><div className="kpi-label">In Shop</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{shopCount}</div><div className="kpi-sub">being serviced</div></div>
            <div className="kpi"><div className="kpi-icon">🚫</div><div className="kpi-label">Out of Service</div><div className="kpi-val" style={{color:'var(--bp-red)'}}>{oosCount}</div><div className="kpi-sub">needs attention</div></div>
            <div className="kpi"><div className="kpi-icon">🏢</div><div className="kpi-label">Owned vs Leased</div><div className="kpi-val">{ownedCount}/{leasedCount}</div><div className="kpi-sub">{ownedCount} owned, {leasedCount} leased</div></div>
            <div className="kpi"><div className="kpi-icon">💰</div><div className="kpi-label">Monthly Lease</div><div className="kpi-val">${totalMonthlyLease.toLocaleString()}</div><div className="kpi-sub">~${Math.round(totalMonthlyLease * 12).toLocaleString()}/yr</div></div>
          </div>

          {/* Category breakdown */}
          <div className="card mb-16" style={{padding:'16px'}}>
            <div className="text-md font-bold color-muted mb-12" style={{textTransform:'uppercase',letterSpacing:'.04em'}}>Fleet by Category</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'10px'}}>
              {FLEET_CATEGORIES.map(c => (
                <div key={c.key} className="card card-flat card-interactive" style={{padding:'12px 14px',textAlign:'center'}} onClick={() => { setCategoryFilter(c.key); setSubTab('master') }}>
                  <div style={{fontSize:'20px',marginBottom:'5px'}}>{c.icon}</div>
                  <div className="text-base color-muted font-semibold">{c.label}</div>
                  <div className="font-bold color-navy font-mono" style={{fontSize:'20px',marginTop:'2px'}}>{categoryCounts[c.key] || 0}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent maintenance */}
          <div className="card" style={{padding:'16px'}}>
            <div className="flex-between mb-12">
              <span className="text-md font-bold color-muted" style={{textTransform:'uppercase',letterSpacing:'.04em'}}>Recent Activity</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setSubTab('maintenance')}>View All →</button>
            </div>
            <div className="text-base color-muted">
              {[
                {unit:'B5',desc:'Transmission repair — waiting on parts',date:'Mar 22',status:'In Shop'},
                {unit:'P5',desc:'Brake pad replacement + alignment',date:'Mar 20',status:'In Shop'},
                {unit:'OX3',desc:'Hydraulic leak — needs new cylinder',date:'Mar 18',status:'Out of Service'},
              ].map((m, i) => (
                <div key={i} className="flex-between" style={{padding:'8px 0',borderBottom: i < 2 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                  <div className="flex gap-8">
                    <span className="font-bold color-navy font-mono" style={{minWidth:'40px'}}>{m.unit}</span>
                    <span>{m.desc}</span>
                  </div>
                  <div className="flex gap-8">
                    <span className="text-md" style={{color:'var(--bp-light)'}}>{m.date}</span>
                    <span className={`badge ${m.status === 'In Shop' ? 'badge-amber' : 'badge-red'}`}>{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fleet Master */}
      {subTab === 'master' && (
        <div className="animate-in">
          <div className="flex gap-8 mb-12">
            <input className="form-input" placeholder="Search unit #, make, model, driver..." style={{maxWidth:'300px'}} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <select className="form-select" style={{width:'150px'}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="form-select" style={{width:'180px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {FLEET_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <span className="text-md color-muted" style={{marginLeft:'auto'}}>{filteredVehicles.length} vehicles</span>
          </div>

          <div className="card card-flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit #</th>
                  <th>Make/Model</th>
                  <th>Year</th>
                  <th>Plate</th>
                  <th>Fuel</th>
                  <th>DOT</th>
                  <th>Ownership</th>
                  <th>Status</th>
                  <th>Driver</th>
                  <th className="r">Odometer</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((v, i) => (
                  <tr key={v.unit} className="clickable" onClick={() => setSelectedVehicle(v)}>
                    <td className="font-bold color-navy font-mono">{v.unit}</td>
                    <td>{v.make} {v.model}</td>
                    <td className="mono">{v.year || '—'}</td>
                    <td className="mono text-md">{v.plate}</td>
                    <td><span className="badge badge-navy">{v.fuel}</span></td>
                    <td>{v.dot ? <span className="badge badge-amber">DOT</span> : '—'}</td>
                    <td><span className={`badge ${v.ownership === 'Owned' ? 'badge-green' : 'badge-blue'}`}>{v.ownership}</span></td>
                    <td>
                      <select className="form-select text-sm font-semibold" value={v.status}
                        style={{padding:'2px 6px',width:'auto', color: v.status === 'Active' ? 'var(--bp-green)' : v.status === 'In Shop' ? 'var(--bp-amber)' : 'var(--bp-red)', borderColor: v.status === 'Active' ? 'var(--bp-green)' : v.status === 'In Shop' ? 'var(--bp-amber)' : 'var(--bp-red)'}}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStatus(v.unit, e.target.value)}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="text-md">{v.driver || '—'}</td>
                    <td className="r mono text-md">{v.odometer ? v.odometer.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lease & Financials */}
      {subTab === 'lease' && (
        <div className="animate-in">
          <div className="kpi-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
            <div className="kpi"><div className="kpi-label">Monthly Obligations</div><div className="kpi-val">${totalMonthlyLease.toLocaleString()}</div><div className="kpi-sub">{leaseData.length} active leases</div></div>
            <div className="kpi"><div className="kpi-label">Annual Lease Cost</div><div className="kpi-val">${Math.round(totalMonthlyLease * 12).toLocaleString()}</div><div className="kpi-sub">projected</div></div>
            <div className="kpi"><div className="kpi-label">Expiring Soon</div><div className="kpi-val">{leaseData.filter(l => { const end = new Date(l.end); const now = new Date(); return (end - now) / 86400000 <= 180 }).length}</div><div className="kpi-sub">within 180 days</div></div>
          </div>
          <div className="card card-flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Lessor</th>
                  <th>Type</th>
                  <th className="r">Monthly</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Mileage Allowance</th>
                  <th>Current Miles</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaseData.map((l, i) => {
                  const end = l.end ? new Date(l.end) : null
                  const daysLeft = end ? Math.ceil((end - new Date()) / 86400000) : null
                  const milesRemaining = l.mileageAllowance - l.currentMiles
                  return (
                    <tr key={i}>
                      <td className="font-bold color-navy font-mono">{l.unit}</td>
                      <td>{l.lessor}</td>
                      <td>{l.type}</td>
                      <td className="r mono font-bold">${l.monthly.toLocaleString()}</td>
                      <td className="mono text-md">{l.start}</td>
                      <td className="mono text-md">{l.end || '—'}</td>
                      <td className="mono text-md">{l.mileageAllowance.toLocaleString()}</td>
                      <td>
                        <div className="flex gap-4">
                          <span className="mono text-md">{l.currentMiles.toLocaleString()}</span>
                          <span className="text-xs font-semibold" style={{color: milesRemaining < 10000 ? 'var(--bp-red)' : 'var(--bp-green)'}}>
                            ({milesRemaining.toLocaleString()} left)
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${daysLeft === null ? 'badge-blue' : daysLeft <= 0 ? 'badge-red' : daysLeft <= 180 ? 'badge-amber' : 'badge-green'}`}>
                          {daysLeft === null ? 'Open-End' : daysLeft <= 0 ? 'Expired' : daysLeft <= 180 ? `${daysLeft}d left` : 'Active'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Maintenance */}
      {subTab === 'maintenance' && (
        <div className="animate-in">
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🔧</div>
              <div className="empty-state-title">Maintenance Log</div>
              <div className="empty-state-sub">Detailed maintenance records including invoice #, date, odometer, labor/parts breakdown, and work summaries. Connected to Dataverse maintenance log table.</div>
            </div>
          </div>
        </div>
      )}

      {/* Compliance */}
      {subTab === 'compliance' && (
        <div className="animate-in">
          <div className="card card-flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Registration</th>
                  <th>Insurance</th>
                  <th>DOT Inspection</th>
                  <th>CDL Req.</th>
                  <th>Fire Ext.</th>
                  <th>Triangle Kit</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.filter(v => v.dot || v.cdl).map((v, i) => (
                  <tr key={i}>
                    <td className="font-bold color-navy font-mono">{v.unit}</td>
                    <td><span className="badge badge-green">OK</span></td>
                    <td><span className="badge badge-green">OK</span></td>
                    <td><span className="badge badge-gray">No Data</span></td>
                    <td>{v.cdl ? <span className="badge badge-blue">Yes</span> : '—'}</td>
                    <td><span className="badge badge-green">✓</span></td>
                    <td><span className="badge badge-green">✓</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fuel & Costs, Utilization, Condition — Shell States */}
      {['fuel','utilization','condition'].includes(subTab) && (
        <div className="animate-in">
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">{subTab === 'fuel' ? '⛽' : subTab === 'utilization' ? '📊' : '🔍'}</div>
              <div className="empty-state-title">{subTab === 'fuel' ? 'Fuel & Costs' : subTab === 'utilization' ? 'Utilization' : 'Condition & Notes'}</div>
              <div className="empty-state-sub">
                {subTab === 'fuel' ? 'Fuel card assignments, MPG tracking, monthly/annual fuel costs, and total cost of ownership per vehicle.' :
                 subTab === 'utilization' ? 'Primary use, assigned crew/department, average monthly miles, days used, and utilization rates.' :
                 'Last inspection dates, exterior/interior condition ratings, body damage tracking, tire and brake condition.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedVehicle && (
        <div className="modal-overlay open" onClick={() => setSelectedVehicle(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'560px'}}>
            <div className="modal-header">
              <h3>{selectedVehicle._isNew ? 'Add Vehicle' : `Unit ${selectedVehicle.unit}`}</h3>
              <button className="modal-close" onClick={() => setSelectedVehicle(null)}>×</button>
            </div>
            {selectedVehicle._isNew ? (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',padding:'4px 0'}}>
                  <div><label className="form-label">Unit Number</label><input className="form-input" value={selectedVehicle.unit} onChange={e => setSelectedVehicle(p => ({...p, unit: e.target.value}))} placeholder="e.g., T-101" autoFocus /></div>
                  <div><label className="form-label">Category</label><select className="form-input" value={selectedVehicle.category} onChange={e => setSelectedVehicle(p => ({...p, category: e.target.value}))}>{FLEET_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
                  <div><label className="form-label">Make</label><input className="form-input" value={selectedVehicle.make} onChange={e => setSelectedVehicle(p => ({...p, make: e.target.value}))} placeholder="Ford, Freightliner..." /></div>
                  <div><label className="form-label">Model</label><input className="form-input" value={selectedVehicle.model} onChange={e => setSelectedVehicle(p => ({...p, model: e.target.value}))} placeholder="F-250, M2 106..." /></div>
                  <div><label className="form-label">Year</label><input className="form-input" type="number" value={selectedVehicle.year} onChange={e => setSelectedVehicle(p => ({...p, year: Number(e.target.value)}))} /></div>
                  <div><label className="form-label">Plate</label><input className="form-input" value={selectedVehicle.plate || ''} onChange={e => setSelectedVehicle(p => ({...p, plate: e.target.value}))} /></div>
                  <div><label className="form-label">VIN</label><input className="form-input" value={selectedVehicle.vin || ''} onChange={e => setSelectedVehicle(p => ({...p, vin: e.target.value}))} /></div>
                  <div><label className="form-label">Fuel</label><select className="form-input" value={selectedVehicle.fuel} onChange={e => setSelectedVehicle(p => ({...p, fuel: e.target.value}))}><option>Diesel</option><option>Gas</option><option>Electric</option><option>Propane</option></select></div>
                  <div><label className="form-label">Status</label><select className="form-input" value={selectedVehicle.status} onChange={e => setSelectedVehicle(p => ({...p, status: e.target.value}))}>{STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
                  <div><label className="form-label">Ownership</label><select className="form-input" value={selectedVehicle.ownership} onChange={e => setSelectedVehicle(p => ({...p, ownership: e.target.value}))}><option>Owned</option><option>Leased</option><option>Rented</option></select></div>
                </div>
                <div className="flex gap-8 mt-12" style={{justifyContent:'flex-end'}}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedVehicle(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" disabled={!selectedVehicle.unit.trim() || !selectedVehicle.make.trim() || savingVehicle} onClick={async () => {
                    if (savingVehicle) return
                    setSavingVehicle(true)
                    try {
                      const payload = {
                        cr55d_unitnumber: selectedVehicle.unit,
                        cr55d_category: selectedVehicle.category,
                        cr55d_make: selectedVehicle.make,
                        cr55d_model: selectedVehicle.model,
                        cr55d_year: selectedVehicle.year,
                        cr55d_plate: selectedVehicle.plate,
                        cr55d_vin: selectedVehicle.vin,
                        cr55d_fuel: selectedVehicle.fuel,
                        cr55d_status: selectedVehicle.status,
                        cr55d_ownership: selectedVehicle.ownership,
                      }
                      await dvPost('cr55d_vehicles', payload)
                      setSelectedVehicle(null)
                      setToast({ msg: 'Vehicle added', type: 'success' }); setTimeout(() => setToast(null), 3000)
                      const data = await dvFetch('cr55d_vehicles?$orderby=cr55d_unitnumber asc&$top=500')
                      if (data?.length) { setVehicles(data.map(mapVehicle)); setDataSource('dataverse') }
                    } catch (e) {
                      setToast({ msg: 'Failed to save vehicle: ' + e.message, type: 'error' }); setTimeout(() => setToast(null), 5000)
                    } finally { setSavingVehicle(false) }
                  }}>{savingVehicle ? 'Saving...' : 'Save Vehicle'}</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',padding:'4px 0'}}>
                  <div className="drawer-field"><span className="drawer-field-label">Make/Model</span><span className="drawer-field-value">{selectedVehicle.make} {selectedVehicle.model}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Year</span><span className="drawer-field-value">{selectedVehicle.year || '—'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">VIN</span><span className="drawer-field-value text-sm font-mono">{selectedVehicle.vin || '—'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Plate</span><span className="drawer-field-value">{selectedVehicle.plate || '—'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Fuel</span><span className="drawer-field-value">{selectedVehicle.fuel}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Status</span><span className="drawer-field-value"><span className={`badge ${STATUS_BADGE_MAP[selectedVehicle.status] || 'badge-gray'}`}>{selectedVehicle.status}</span></span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Ownership</span><span className="drawer-field-value">{selectedVehicle.ownership}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">DOT Required</span><span className="drawer-field-value">{selectedVehicle.dot ? 'Yes' : 'No'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">CDL Required</span><span className="drawer-field-value">{selectedVehicle.cdl ? 'Yes' : 'No'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">State</span><span className="drawer-field-value">{selectedVehicle.state || '—'}</span></div>
                </div>
                {selectedVehicle.notes && (
                  <div className="callout callout-amber mt-12">
                    <span className="callout-icon">📝</span>
                    <div>{selectedVehicle.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <div className={`toast show ${toast.type || 'info'}`}>{toast.msg}</div>}
    </div>
  )
}
