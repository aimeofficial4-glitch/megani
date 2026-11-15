import React from 'react';
import {
  Cpu,
  Atom,
  GraduationCap,
  Briefcase,
  HeartPulse,
  Leaf,
  Landmark,
  Sprout,
  Wrench,
  ShieldCheck,
  Trophy,
  Palette,
  BookOpen,
} from 'lucide-react';

export const CategoryIcon: React.FC<{ name: string; className?: string }> = ({
  name,
  className = 'w-5 h-5',
}) => {
  switch (name) {
    case 'Cpu':
      return <Cpu className={className} />;
    case 'Atom':
      return <Atom className={className} />;
    case 'GraduationCap':
      return <GraduationCap className={className} />;
    case 'Briefcase':
      return <Briefcase className={className} />;
    case 'HeartPulse':
      return <HeartPulse className={className} />;
    case 'Leaf':
      return <Leaf className={className} />;
    case 'Landmark':
      return <Landmark className={className} />;
    case 'Sprout':
      return <Sprout className={className} />;
    case 'Wrench':
      return <Wrench className={className} />;
    case 'ShieldCheck':
      return <ShieldCheck className={className} />;
    case 'Trophy':
      return <Trophy className={className} />;
    case 'Palette':
      return <Palette className={className} />;
    default:
      return <BookOpen className={className} />;
  }
};
