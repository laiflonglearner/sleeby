/// <reference types="node" />
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import { SleebyRepository, type SQLiteDatabase } from '@sleeby/data';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { HabitForm } from './habit-form';
import { NightDetail } from './night-detail';
import { Onboarding } from './onboarding';
import { PrivacyNote } from './privacy-note';
import { SettingsForm } from './settings-form';
import { SleepForm } from './sleep-form';

const mockNavigation = { addListener: () => jest.fn(), dispatch: jest.fn() };
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));
let mockId = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `journey-${++mockId}`),
}));
// Wheel gestures have their own tests; this journey exercises saved values.
jest.mock('./time-entry', () => ({
  ...jest.requireActual('./time-entry'),
  TimeEntry: ({
    label,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
  }) => {
    const React = jest.requireActual('react');
    const { TextInput } = jest.requireActual('react-native');
    return React.createElement(TextInput, {
      accessibilityLabel: `${label} time`,
      value: String(value),
      editable: !disabled,
      onChangeText: (text: string) => onChange(Number(text)),
    });
  },
}));

async function withDatabase(
  run: (context: {
    repository: SleebyRepository;
    reopen: () => SleebyRepository;
    failNight: (value: boolean) => void;
  }) => Promise<void>,
) {
  // Node loads SQLite directly because Jest does not list this built-in.
  const { DatabaseSync } = createRequire(__filename)(
    'node:sqlite',
  ) as typeof import('node:sqlite');
  const folder = mkdtempSync(join(tmpdir(), 'sleeby-journey-'));
  const path = join(folder, 'synthetic.db');
  let db = new DatabaseSync(path);
  const zone = jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({
      timeZone: 'Asia/Jakarta',
    } as Intl.ResolvedDateTimeFormatOptions);
  try {
    for (const file of [
      '0000_overrated_cargill.sql',
      '0001_immutable_history.sql',
      '0002_manual_tracking.sql',
    ])
      db.exec(
        readFileSync(
          resolve(__dirname, '../../../../packages/data/migrations', file),
          'utf8',
        ),
      );
    let failNight = false;
    const port: SQLiteDatabase = {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const statement = db.prepare(sql);
        return {
          get: (...args) => statement.get(...args),
          all: (...args) => statement.all(...args),
          run: (...args) => {
            if (failNight && sql.startsWith('INSERT INTO nights'))
              throw new Error('synthetic-night-failure');
            return statement.run(...args);
          },
        };
      },
    };
    await run({
      repository: new SleebyRepository(port),
      reopen: () => {
        db.close();
        db = new DatabaseSync(path);
        return new SleebyRepository(db);
      },
      failNight: (value) => {
        failNight = value;
      },
    });
  } finally {
    await cleanup();
    zone.mockRestore();
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
}
it('keeps confirmed settings and complete habit edits through a SQLite restart', async () => {
  await withDatabase(async (context) => {
    let repository = context.repository;
    let view: Awaited<ReturnType<typeof render>>;
    const settings = () => repository.readCurrentTrackingSettings()!.value;
    const day = '2026-10-08';
    const saved = jest.fn();
    expect(repository.readCurrentTrackingSettings()).toBeNull();
    view = await render(
      <Onboarding repository={repository} onConfirmed={saved} />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: `${copy.dayStartConfirm} 04:00` }),
    );
    await view.unmount();
    view = await render(
      <PrivacyNote
        repository={repository}
        settings={settings()}
        onSaved={saved}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.continue }));
    await view.unmount();
    expect(settings()).toMatchObject({
      dayBoundaryMinutes: 240,
      privacyNoteAcknowledged: true,
      strongerContrast: false,
    });

    view = await render(
      <SettingsForm
        repository={repository}
        initial={settings()}
        onSaved={saved}
      />,
    );
    await fireEvent(
      screen.getByRole('switch', { name: 'Sleep target' }),
      'valueChange',
      true,
    );
    await fireEvent.changeText(
      screen.getByLabelText('Target bedtime time'),
      '1380',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Target wake time time'),
      '420',
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();

    view = await render(
      <HabitForm
        repository={repository}
        settings={settings()}
        day={day}
        initial={null}
        onSaved={saved}
        onDirty={jest.fn()}
      />,
    );
    await fireEvent(
      screen.getByRole('switch', { name: copy.lastMeal }),
      'valueChange',
      true,
    );
    await fireEvent.changeText(
      screen.getByLabelText(`${copy.lastMeal} time`),
      '1200',
    );
    for (const [label, value] of [
      ['Morning sunlight minutes', '15'],
      ['Afternoon sunlight minutes', '10'],
      ['Movement minutes', '30'],
      ['Screen-free minutes', '45'],
    ])
      await fireEvent.changeText(screen.getByLabelText(label!), value!);
    await fireEvent.press(
      screen.getByRole('radio', { name: 'Movement completed: Yes' }),
    );
    await fireEvent.press(
      screen.getByRole('radio', { name: `${copy.caffeineFree}: Yes` }),
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();
    const originalHabit = repository.readCurrentHabit(day)!.value;
    expect(originalHabit).toMatchObject({
      lastMeal: { utc: '2026-10-08T13:00:00.000Z' },
      morningSunlightMinutes: 15,
      afternoonSunlightMinutes: 10,
      movementCompleted: true,
      movementMinutes: 30,
      screenFreeMinutes: 45,
    });
    view = await render(
      <HabitForm
        repository={repository}
        settings={settings()}
        day={day}
        initial={originalHabit}
        onSaved={saved}
        onDirty={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.edit }));
    await fireEvent.changeText(
      screen.getByLabelText('Screen-free minutes'),
      '60',
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();
    const editedHabit = repository.readCurrentHabit(day)!.value;
    expect(editedHabit).toEqual({
      ...originalHabit,
      id: editedHabit.id,
      timestamp: editedHabit.timestamp,
      screenFreeMinutes: 60,
    });

    repository = context.reopen();
    expect(repository.readCurrentHabit(day)!.value).toEqual(editedHabit);
    expect(repository.readHabits(day)).toEqual([
      { value: originalHabit, supersedesId: null },
      { value: editedHabit, supersedesId: originalHabit.id },
    ]);
    view = await render(
      <HabitForm
        repository={repository}
        settings={settings()}
        day={day}
        initial={repository.readCurrentHabit(day)!.value}
        onSaved={saved}
        onDirty={jest.fn()}
      />,
    );
    expect(screen.getByText('Screen-free minutes: 60')).toBeTruthy();
    expect(screen.getByText('Last meal: 20:00')).toBeTruthy();
    await view.unmount();
  });
});

it('keeps sleep retries, main choice, past edits and target snapshots through a SQLite restart', async () => {
  await withDatabase(async (context) => {
    let repository = context.repository;
    let view: Awaited<ReturnType<typeof render>>;
    const settings = () => repository.readCurrentTrackingSettings()!.value;
    const day = '2026-10-08';
    const saved = jest.fn();
    repository.saveTrackingSettings(
      {
        id: 'sleep-settings',
        timestamp: {
          utc: '2026-10-08T16:00:00.000Z',
          reference: { kind: 'iana', zone: 'Asia/Jakarta' },
        },
        dayBoundaryMinutes: 240,
        target: { bedtimeMinutes: 1380, wakeMinutes: 420 },
        privacyNoteAcknowledged: true,
        strongerContrast: false,
      },
      null,
    );
    const firstSettings = settings();
    const current = () => repository.readCurrentNight(day)!.value;
    view = await render(
      <SleepForm
        repository={repository}
        settings={settings()}
        day={day}
        night={null}
        initial={null}
        onSaved={saved}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Sleep time'), '1380');
    await fireEvent.changeText(screen.getByLabelText('Wake time'), '420');
    expect(screen.getByText('480 minutes')).toBeTruthy();
    expect(
      screen.getByText('Sleep: 2026-10-08 to 2026-10-09 (Asia/Jakarta)'),
    ).toBeTruthy();
    context.failNight(true);
    saved.mockClear();
    jest.mocked(randomUUID).mockClear();
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    expect(screen.getByText(copy.saveFailed)).toBeTruthy();
    expect(screen.queryByText(copy.saved)).toBeNull();
    expect(screen.getByLabelText('Wake time')).toHaveDisplayValue('420');
    expect(saved).not.toHaveBeenCalled();
    expect(repository.readRawPage(10).records).toHaveLength(0);
    expect(repository.readCurrentNight(day)).toBeNull();
    expect(randomUUID).toHaveBeenCalledTimes(2);
    context.failNight(false);
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledWith(day);
    expect(repository.readRawPage(10).records).toHaveLength(1);
    await view.unmount();
    const originalNight = current();
    const originalSleep = repository.readSleepByIds(
      originalNight.sessionIds,
    )[0]!;
    view = await render(
      <NightDetail repository={repository} nightKey={day} askMain />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: `${copy.useMainSleep}: 2026-10-08 23:00 to 2026-10-09 07:00 (480 minutes)`,
      }),
    );
    await view.unmount();
    expect(current().primarySessionId).toBe(originalSleep.id);

    view = await render(
      <SleepForm
        repository={repository}
        settings={settings()}
        day={day}
        night={current()}
        initial={originalSleep}
        onSaved={saved}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Wake time'), '450');
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();
    const editedSleep = repository.readSleepByIds(current().sessionIds)[0]!;
    expect(current().primarySessionId).toBe(editedSleep.id);

    view = await render(
      <SleepForm
        repository={repository}
        settings={settings()}
        day={day}
        night={current()}
        initial={null}
        onSaved={saved}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Sleep time'), '840');
    await fireEvent.changeText(screen.getByLabelText('Wake time'), '900');
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();
    expect(current().sessionIds).toHaveLength(2);
    expect(current().primarySessionId).toBe(editedSleep.id);

    view = await render(
      <SettingsForm
        repository={repository}
        initial={settings()}
        onSaved={saved}
      />,
    );
    await fireEvent.changeText(
      screen.getByLabelText(`${copy.dayStart} time`),
      '360',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Target bedtime time'),
      '1320',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Target wake time time'),
      '360',
    );
    await fireEvent(
      screen.getByRole('switch', { name: 'Stronger contrast' }),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();
    view = await render(
      <SleepForm
        repository={repository}
        settings={settings()}
        day="2026-10-09"
        night={null}
        initial={null}
        onSaved={saved}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Sleep time'), '1320');
    await fireEvent.changeText(screen.getByLabelText('Wake time'), '360');
    await fireEvent.press(screen.getByRole('button', { name: copy.save }));
    await view.unmount();
    repository = context.reopen();
    expect(current()).toMatchObject({
      keyAssignment: { key: day, boundaryMinutes: 240 },
      target: firstSettings.target,
      primarySessionId: editedSleep.id,
    });
    expect(repository.readCurrentNight('2026-10-09')!.value).toMatchObject({
      keyAssignment: { key: '2026-10-09', boundaryMinutes: 360 },
      target: { bedtimeMinutes: 1320, wakeMinutes: 360 },
    });
    expect(settings()).toMatchObject({
      dayBoundaryMinutes: 360,
      strongerContrast: true,
    });
    expect(repository.readSleepByIds([originalSleep.id])).toEqual([
      originalSleep,
    ]);
    expect(
      repository
        .readNightHistoryPage(day, 10)
        .revisions.map(({ value }) => value),
    ).toEqual(expect.arrayContaining([originalNight]));
    view = await render(
      <NightDetail repository={repository} nightKey={day} askMain />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(current().primarySessionId).toBe(editedSleep.id);
    expect(
      screen.getAllByText(
        '2026-10-08 23:00 to 2026-10-09 07:30 (510 minutes) (Main sleep)',
      )[0],
    ).toBeTruthy();
    expect(screen.getAllByText(`${copy.pastEdits}: ${day}`)[0]).toBeTruthy();
  });
});
