import { useState, useCallback } from 'react';
import { Box, TextField, IconButton, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

interface DynamicListFieldProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  required?: boolean;
  addLabel?: string;
  maxItems?: number;
}

export default function DynamicListField({
  label,
  values = [],
  onChange,
  placeholder = '',
  required = false,
  addLabel = '添加',
  maxItems = 10,
}: DynamicListFieldProps) {
  const [items, setItems] = useState<string[]>(
    values.length > 0 ? values : ['']
  );

  const updateItem = useCallback((index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
    onChange(newItems.filter(v => v.trim() !== ''));
  }, [items, onChange]);

  const addItem = useCallback(() => {
    if (items.length >= maxItems) return;
    const newItems = [...items, ''];
    setItems(newItems);
  }, [items, maxItems]);

  const removeItem = useCallback((index: number) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    onChange(newItems.filter(v => v.trim() !== ''));
  }, [items, onChange]);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </Typography>
      {items.map((item, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            value={item}
            onChange={(e) => updateItem(index, e.target.value)}
            placeholder={placeholder}
            fullWidth
            size="small"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && index === items.length - 1 && item.trim() !== '' && items.length < maxItems) {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <IconButton
            onClick={() => removeItem(index)}
            disabled={items.length <= 1}
            size="small"
            sx={{ color: items.length <= 1 ? '#cbd5e1' : '#ef4444' }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      {items.length < maxItems && (
        <Button
          startIcon={<AddIcon />}
          onClick={addItem}
          size="small"
          sx={{ color: '#3b82f6', textTransform: 'none' }}
        >
          {addLabel}
        </Button>
      )}
    </Box>
  );
}