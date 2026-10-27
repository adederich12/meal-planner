import { queryOptions } from '@tanstack/react-query';
import { systemService } from '../services/system.service';

export const systemKeys = {
  all: ['system'] as const,
  health: () => [...systemKeys.all, 'health'] as const,
};

export const healthQuery = () =>
  queryOptions({
    queryKey: systemKeys.health(),
    queryFn: systemService.getHealth,
    refetchInterval: 15_000,
  });
