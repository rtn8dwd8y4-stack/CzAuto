import { Card, CardContent, Typography, Box } from '@mui/material';
import { SERVICE_TYPES, ServiceType } from '../../types/apply';

interface ServiceCardProps {
  id: ServiceType;
  name: string;
  description: string;
  icon: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ServiceCard({ id, name, description, icon, selected, disabled, onClick }: ServiceCardProps) {
  return (
    <Card
      onClick={disabled ? undefined : onClick}
      sx={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: selected ? '2px solid #3b82f6' : '2px solid #e2e8f0',
        background: selected ? '#eff6ff' : disabled ? '#f8fafc' : '#fff',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
        '&:hover': disabled ? {} : {
          borderColor: '#3b82f6',
          background: '#eff6ff',
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
        },
      }}
    >
      <CardContent sx={{ textAlign: 'center', py: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '15px', mb: 0.5 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '13px' }}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}

interface ServiceCardListProps {
  selectedService: string;
  onSelect: (id: string) => void;
}

export function ServiceCardList({ selectedService, onSelect }: ServiceCardListProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
        gap: 2,
        mt: 2,
      }}
    >
      {SERVICE_TYPES.map((service) => (
        <ServiceCard
          key={service.id}
          id={service.id}
          name={service.name}
          description={service.description}
          icon={service.icon}
          selected={selectedService === service.id}
          disabled={false}
          onClick={() => onSelect(service.id)}
        />
      ))}
    </Box>
  );
}