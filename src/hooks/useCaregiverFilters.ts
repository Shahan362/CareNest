import { useState } from 'react';
import { addDays, format, startOfWeek } from 'date-fns';
import { Caregiver } from '@/types/admin';

export const useCaregiverFilters = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [region, setRegion] = useState<string>('all');
  const [heatmapWeekStart, setHeatmapWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [showOverbookedOnly, setShowOverbookedOnly] = useState(false);

  const filterCaregivers = (caregivers: Caregiver[], activeView: string) => {
    const term = searchTerm.trim().toLowerCase();
    return caregivers.filter((caregiver) => {
      const matchesSearch =
        !term ||
        caregiver.name.toLowerCase().includes(term) ||
        caregiver.specialty.toLowerCase().includes(term) ||
        caregiver.patientsList.some(
          (patient) => patient.name.toLowerCase().includes(term) || patient.carePlan.toLowerCase().includes(term),
        );

      const matchesRegion = region === 'all' || caregiver.region === region;

      // Heatmap: optionally show only caregivers booked at 91%+ in the selected week.
      if (activeView === 'heatmap' && showOverbookedOnly) {
        const weeklyTotal = Array.from({ length: 7 }, (_, i) =>
          format(addDays(heatmapWeekStart, i), 'yyyy-MM-dd'),
        ).reduce((t, key) => t + (caregiver.weeklyUtilization[key]?.hours ?? 0), 0);
        const pct = caregiver.maxHours > 0 ? (weeklyTotal / caregiver.maxHours) * 100 : 0;
        return matchesSearch && matchesRegion && pct >= 91;
      }

      return matchesSearch && matchesRegion;
    });
  };

  return {
    searchTerm,
    region,
    heatmapWeekStart,
    showOverbookedOnly,
    setSearchTerm,
    setRegion,
    setHeatmapWeekStart,
    setShowOverbookedOnly,
    filterCaregivers,
  };
};
