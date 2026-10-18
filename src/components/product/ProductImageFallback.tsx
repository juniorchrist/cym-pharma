import React from 'react';
import {
  Package,
  Activity,
  Shield,
  Scissors,
  HeartPulse,
  Syringe,
  Wind,
  Layers,
  Thermometer,
  Eye,
  Cross,
  Sparkles,
  FlaskConical,
  Scale,
  Bed,
  Truck,
  Pipette,
  ShoppingBag,
  Receipt,
  Stethoscope,
  Accessibility,
  Box,
  Bandage,
  Hand,
  Gauge,
  Ear,
  Ruler,
  Trash2,
  Smile,
  Droplet,
} from 'lucide-react';

interface ProductImageFallbackProps {
  category?: string;
  name?: string;
  size?: number;
}

export const ProductImageFallback: React.FC<ProductImageFallbackProps> = ({
  category = '',
  name = '',
  size = 36,
}) => {
  const text = (category + ' ' + name).toLowerCase();

  const getIconAndStyle = () => {
    if (text.includes('abaisse')) {
      return {
        icon: <Smile style={{ width: size, height: size }} className="text-sky-600" strokeWidth={1.8} />,
        bg: 'bg-sky-50 border-sky-100',
      };
    }
    if (text.includes('poubelle')) {
      return {
        icon: <Trash2 style={{ width: size, height: size }} className="text-rose-600" strokeWidth={1.8} />,
        bg: 'bg-rose-50 border-rose-100',
      };
    }
    if (text.includes('manodeten')) {
      return {
        icon: <Gauge style={{ width: size, height: size }} className="text-blue-600" strokeWidth={1.8} />,
        bg: 'bg-blue-50 border-blue-100',
      };
    }
    if (text.includes('toise')) {
      return {
        icon: <Ruler style={{ width: size, height: size }} className="text-slate-700" strokeWidth={1.8} />,
        bg: 'bg-slate-50 border-slate-200',
      };
    }
    if (text.includes('gant')) {
      return {
        icon: <Hand style={{ width: size, height: size }} className="text-cyan-600" strokeWidth={1.8} />,
        bg: 'bg-cyan-50 border-cyan-100',
      };
    }
    if (text.includes('oto')) {
      return {
        icon: <Ear style={{ width: size, height: size }} className="text-purple-600" strokeWidth={1.8} />,
        bg: 'bg-purple-50 border-purple-100',
      };
    }
    if (text.includes('aerosol') || text.includes('aérosol') || text.includes('nebulis') || text.includes('guedel') || text.includes('oxygene')) {
      return {
        icon: <Wind style={{ width: size, height: size }} className="text-blue-600" strokeWidth={1.8} />,
        bg: 'bg-blue-50 border-blue-100',
      };
    }
    if (text.includes('aiguille') || text.includes('seringue') || text.includes('injection') || text.includes('perfus') || text.includes('intranule') || text.includes('catheter') || text.includes('epicran') || text.includes('transfus') || text.includes('prolong')) {
      return {
        icon: <Syringe style={{ width: size, height: size }} className="text-amber-600" strokeWidth={1.8} />,
        bg: 'bg-amber-50 border-amber-100',
      };
    }
    if (text.includes('stetho')) {
      return {
        icon: <Stethoscope style={{ width: size, height: size }} className="text-sky-700" strokeWidth={1.8} />,
        bg: 'bg-sky-50 border-sky-100',
      };
    }
    if (text.includes('ortho') || text.includes('bequille') || text.includes('canne') || text.includes('fauteuil') || text.includes('lombaire')) {
      return {
        icon: <Accessibility style={{ width: size, height: size }} className="text-teal-600" strokeWidth={1.8} />,
        bg: 'bg-teal-50 border-teal-100',
      };
    }
    if (text.includes('masque') || text.includes('charlotte') || text.includes('visiere') || text.includes('protect')) {
      return {
        icon: <Shield style={{ width: size, height: size }} className="text-cyan-600" strokeWidth={1.8} />,
        bg: 'bg-cyan-50 border-cyan-100',
      };
    }
    if (text.includes('chirurg') || text.includes('bistouri') || text.includes('lame') || text.includes('fil') || text.includes('suture') || text.includes('trocar')) {
      return {
        icon: <Scissors style={{ width: size, height: size }} className="text-purple-600" strokeWidth={1.8} />,
        bg: 'bg-purple-50 border-purple-100',
      };
    }
    if (text.includes('tensio') || text.includes('gluco') || text.includes('oxymetr') || text.includes('doppler') || text.includes('hemoglo') || text.includes('test') || text.includes('electrod') || text.includes('garrot')) {
      return {
        icon: <Activity style={{ width: size, height: size }} className="text-rose-600" strokeWidth={1.8} />,
        bg: 'bg-rose-50 border-rose-100',
      };
    }
    if (text.includes('secours') || text.includes('trousse') || text.includes('urgence') || text.includes('valise')) {
      return {
        icon: <Cross style={{ width: size, height: size }} className="text-red-600" strokeWidth={1.8} />,
        bg: 'bg-red-50 border-red-100',
      };
    }
    if (text.includes('steril') || text.includes('autoclave') || text.includes('poupinel')) {
      return {
        icon: <Sparkles style={{ width: size, height: size }} className="text-indigo-600" strokeWidth={1.8} />,
        bg: 'bg-indigo-50 border-indigo-100',
      };
    }
    if (text.includes('bande') || text.includes('sparadrap')) {
      return {
        icon: <Bandage style={{ width: size, height: size }} className="text-fuchsia-600" strokeWidth={1.8} />,
        bg: 'bg-fuchsia-50 border-fuchsia-100',
      };
    }
    if (text.includes('compresse') || text.includes('coton') || text.includes('drap')) {
      return {
        icon: <Layers style={{ width: size, height: size }} className="text-fuchsia-600" strokeWidth={1.8} />,
        bg: 'bg-fuchsia-50 border-fuchsia-100',
      };
    }
    if (text.includes('thermo')) {
      return {
        icon: <Thermometer style={{ width: size, height: size }} className="text-orange-600" strokeWidth={1.8} />,
        bg: 'bg-orange-50 border-orange-100',
      };
    }
    if (text.includes('echo') || text.includes('negato') || text.includes('speculum') || text.includes('lampe')) {
      return {
        icon: <Eye style={{ width: size, height: size }} className="text-blue-700" strokeWidth={1.8} />,
        bg: 'bg-blue-50 border-blue-100',
      };
    }
    if (text.includes('alcool') || text.includes('pot') || text.includes('pissette') || text.includes('eprouvette')) {
      return {
        icon: <FlaskConical style={{ width: size, height: size }} className="text-emerald-600" strokeWidth={1.8} />,
        bg: 'bg-emerald-50 border-emerald-100',
      };
    }
    if (text.includes('pesee') || text.includes('pese') || text.includes('balance')) {
      return {
        icon: <Scale style={{ width: size, height: size }} className="text-slate-700" strokeWidth={1.8} />,
        bg: 'bg-slate-50 border-slate-200',
      };
    }
    if (text.includes('lit') || text.includes('matelas') || text.includes('bassin') || text.includes('urinal')) {
      return {
        icon: <Bed style={{ width: size, height: size }} className="text-slate-700" strokeWidth={1.8} />,
        bg: 'bg-slate-50 border-slate-200',
      };
    }
    if (text.includes('chariot') || text.includes('potence')) {
      return {
        icon: <Truck style={{ width: size, height: size }} className="text-indigo-600" strokeWidth={1.8} />,
        bg: 'bg-indigo-50 border-indigo-100',
      };
    }
    if (text.includes('sonde') || text.includes('peniflow') || text.includes('ecouvillon') || text.includes('robinet') || text.includes('tube')) {
      return {
        icon: <Pipette style={{ width: size, height: size }} className="text-cyan-700" strokeWidth={1.8} />,
        bg: 'bg-cyan-50 border-cyan-100',
      };
    }
    if (text.includes('sac')) {
      return {
        icon: <ShoppingBag style={{ width: size, height: size }} className="text-emerald-700" strokeWidth={1.8} />,
        bg: 'bg-emerald-50 border-emerald-100',
      };
    }
    if (text.includes('rouleau')) {
      return {
        icon: <Receipt style={{ width: size, height: size }} className="text-slate-600" strokeWidth={1.8} />,
        bg: 'bg-slate-50 border-slate-200',
      };
    }

    return {
      icon: <Box style={{ width: size, height: size }} className="text-[var(--primary)]" strokeWidth={1.8} />,
      bg: 'bg-blue-50/50 border-blue-100',
    };
  };

  const { icon, bg } = getIconAndStyle();

  return (
    <div className="flex flex-col items-center justify-center p-3 text-center select-none w-full h-full">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-xs transition-transform duration-200 group-hover:scale-105 ${bg}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-2 line-clamp-1">
        {category || 'Dispositif Médical'}
      </span>
    </div>
  );
};
