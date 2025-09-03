import { Button, Group, Paper, Stack, TextInput, Textarea, Title } from '@mantine/core';
import { useCreate } from '@refinedev/core';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

interface FormValues {
  name: string;
  description?: string;
}

export const ApplicationCreate: React.FC = () => {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    defaultValues: { name: '', description: '' }
  });

  const { mutate: createApp, isLoading } = useCreate();

  const onSubmit = (values: FormValues) => {
    createApp(
      { resource: 'applications', values },
      {
        onSuccess: ({ data }) => {
          navigate(`/applications/${data.id}`);
        }
      }
    );
  };

  return (
    <Stack spacing="lg">
      <Title order={2}>Create Application</Title>
      <Paper withBorder p="md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack>
            <TextInput
              label="Name"
              placeholder="My App"
              required
              error={errors.name?.message}
              {...register('name', { required: 'Name is required' })}
            />
            <Textarea label="Description" placeholder="What is this application for?" {...register('description')} />
            <Group position="right">
              <Button variant="light" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
