'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Clock, Users, ArrowRightLeft, ChevronDown, ChevronUp,
  Calculator, Info, BarChart3, Bus, Timer, Package, AlertTriangle,
  ArrowRight, TrendingUp, Gauge,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import dynamic from 'next/dynamic';
import { ThemeToggle } from '@/components/theme-toggle';

const CompletionChart = dynamic(() => import('@/components/completion-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full flex items-center justify-center bg-muted/30 rounded-lg">
      <p className="text-muted-foreground text-sm">Loading chart…</p>
    </div>
  ),
});

/* ─── Math helpers ─── */

interface CalcInputs {
  cars: number;
  driveTime: number;
  shuttleWait: number;
  rideBack: number;
  loadTime: number;
  deadline: number; // minutes
}

interface ShuttleInputs {
  shuttleSeats: number;
  shuttleCount: number;
  shuttleCycleTime: number; // minutes round-trip for shuttle itself
}

function cycleTime(i: CalcInputs): number {
  return (i?.loadTime ?? 0) + (i?.driveTime ?? 0) + (i?.shuttleWait ?? 0) + (i?.rideBack ?? 0);
}

/** How many cars one driver can move in `deadline` minutes */
function carsPerDriver(i: CalcInputs): number {
  const ct = cycleTime(i);
  const firstCarTime = (i?.loadTime ?? 0) + (i?.driveTime ?? 0);
  if (firstCarTime > (i?.deadline ?? 0)) return 0;
  if (ct <= 0) return (i?.deadline ?? 0) >= firstCarTime ? 1 : 0;
  return 1 + Math.floor(((i?.deadline ?? 0) - firstCarTime) / ct);
}

/** Minimum drivers needed to move all cars within deadline */
function minDrivers(i: CalcInputs): number {
  const cpd = carsPerDriver(i);
  if (cpd <= 0) return Infinity;
  return Math.ceil((i?.cars ?? 1) / cpd);
}

/** Time (minutes) for `driverCount` drivers to move all cars */
function completionTime(i: CalcInputs, driverCount: number): number {
  if (driverCount <= 0) return Infinity;
  const carsEach = Math.ceil((i?.cars ?? 1) / driverCount);
  if (carsEach <= 0) return 0;
  const ct = cycleTime(i);
  const firstCarTime = (i?.loadTime ?? 0) + (i?.driveTime ?? 0);
  return (carsEach - 1) * ct + firstCarTime;
}

function utilization(i: CalcInputs, driverCount: number): number {
  if (driverCount <= 0) return 0;
  const ct = completionTime(i, driverCount);
  if (ct <= 0 || !isFinite(ct)) return 0;
  const totalCarMinutes = (i?.cars ?? 0) * ((i?.loadTime ?? 0) + (i?.driveTime ?? 0));
  const totalDriverMinutes = driverCount * ct;
  if (totalDriverMinutes <= 0) return 0;
  return Math.min(100, (totalCarMinutes / totalDriverMinutes) * 100);
}

function shuttleBottleneck(i: CalcInputs, driverCount: number, s: ShuttleInputs): { isBottleneck: boolean; msg: string } {
  if ((s?.shuttleCycleTime ?? 0) <= 0 || (s?.shuttleSeats ?? 0) <= 0 || (s?.shuttleCount ?? 0) <= 0) {
    return { isBottleneck: false, msg: '' };
  }
  const ct = cycleTime(i);
  if (ct <= 0) return { isBottleneck: false, msg: '' };
  // Driver throughput: how many drivers need a shuttle seat per minute
  const driverDemandPerMin = driverCount / ct;
  // Shuttle throughput: seats available per minute
  const shuttleThroughputPerMin = ((s?.shuttleSeats ?? 1) * (s?.shuttleCount ?? 1)) / (s?.shuttleCycleTime ?? 1);
  if (driverDemandPerMin > shuttleThroughputPerMin) {
    return {
      isBottleneck: true,
      msg: `Shuttle capacity is a bottleneck. Drivers need ${driverDemandPerMin.toFixed(1)} seats/min but shuttles provide ${shuttleThroughputPerMin.toFixed(1)} seats/min. Add shuttles or seats to avoid delays.`,
    };
  }
  return { isBottleneck: false, msg: `Shuttle capacity is sufficient (${shuttleThroughputPerMin.toFixed(1)} seats/min available vs ${driverDemandPerMin.toFixed(1)} needed).` };
}

function formatTime(minutes: number): string {
  if (!isFinite(minutes) || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/* ─── Component ─── */

export default function DriverCalculator() {
  const [mode, setMode] = useState<'forward' | 'reverse'>('forward');
  const [cars, setCars] = useState(50);
  const [driveTime, setDriveTime] = useState(30);
  const [shuttleWait, setShuttleWait] = useState(10);
  const [rideBack, setRideBack] = useState(25);
  const [loadTime, setLoadTime] = useState(5);
  const [deadlineHours, setDeadlineHours] = useState(8);
  const [givenDrivers, setGivenDrivers] = useState(8);
  const [showShuttle, setShowShuttle] = useState(false);
  const [shuttleSeats, setShuttleSeats] = useState(8);
  const [shuttleCount, setShuttleCount] = useState(1);
  const [shuttleCycleTime, setShuttleCycleTime] = useState(35);
  const [showFormula, setShowFormula] = useState(false);

  const inputs: CalcInputs = useMemo(
    () => ({ cars, driveTime, shuttleWait, rideBack, loadTime, deadline: deadlineHours * 60 }),
    [cars, driveTime, shuttleWait, rideBack, loadTime, deadlineHours]
  );

  const sInputs: ShuttleInputs = useMemo(
    () => ({ shuttleSeats, shuttleCount, shuttleCycleTime }),
    [shuttleSeats, shuttleCount, shuttleCycleTime]
  );

  const ct = cycleTime(inputs);
  const cpd = carsPerDriver(inputs);
  const md = minDrivers(inputs);
  const compTime = completionTime(inputs, mode === 'reverse' ? givenDrivers : md);
  const util = utilization(inputs, mode === 'reverse' ? givenDrivers : md);
  const sb = showShuttle ? shuttleBottleneck(inputs, mode === 'reverse' ? givenDrivers : md, sInputs) : null;

  const activeDrivers = mode === 'reverse' ? givenDrivers : md;

  // What-if table data
  const whatIfData = useMemo(() => {
    const center = isFinite(activeDrivers) ? activeDrivers : 5;
    const lo = Math.max(1, center - 3);
    const hi = center + 5;
    const rows: { drivers: number; time: number; carsEach: number; util: number; isOptimal: boolean }[] = [];
    for (let d = lo; d <= hi; d++) {
      rows.push({
        drivers: d,
        time: completionTime(inputs, d),
        carsEach: Math.ceil((inputs?.cars ?? 1) / d),
        util: utilization(inputs, d),
        isOptimal: d === (isFinite(md) ? md : -1),
      });
    }
    return rows;
  }, [inputs, activeDrivers, md]);

  // Chart data
  const chartData = useMemo(() => {
    const pts: { drivers: number; minutes: number }[] = [];
    const maxD = Math.max(20, (isFinite(activeDrivers) ? activeDrivers : 5) + 10);
    for (let d = 1; d <= maxD; d++) {
      const t = completionTime(inputs, d);
      if (isFinite(t)) pts.push({ drivers: d, minutes: Math.round(t * 10) / 10 });
    }
    return pts;
  }, [inputs, activeDrivers]);

  const numInput = useCallback(
    (label: string, value: number, setter: (v: number) => void, icon: React.ReactNode, unit: string, tip?: string, min = 0) => (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-primary">{icon}</span>
          <Label className="text-sm font-medium">{label}</Label>
          {tip && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  {tip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="relative">
          <Input
            type="number"
            min={min}
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const v = parseFloat(e?.target?.value ?? '0');
              setter(isNaN(v) ? 0 : Math.max(min, v));
            }}
            className="pr-12 font-mono tabular-nums"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
    ),
    []
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary p-2">
              <Truck className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight">Driver Calculator</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Fleet logistics planning tool</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-2"
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            How many <span className="text-primary">drivers</span> do you need?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Enter your fleet details below and get instant answers — including a full what-if analysis.
          </p>
        </motion.div>

        {/* Mode Tabs */}
        <Tabs value={mode} onValueChange={(v: any) => setMode(v as 'forward' | 'reverse')} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="forward" className="gap-1.5">
              <Calculator className="h-4 w-4" /> Find Drivers Needed
            </TabsTrigger>
            <TabsTrigger value="reverse" className="gap-1.5">
              <Clock className="h-4 w-4" /> Find Completion Time
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
            {/* ── Inputs Column ── */}
            <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" /> Job Parameters
                  </CardTitle>
                  <CardDescription>Configure your move details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {numInput('Cars to Move', cars, setCars, <Truck className="h-4 w-4" />, 'cars', 'Total number of vehicles to relocate', 1)}
                  {numInput('One-Way Drive Time', driveTime, setDriveTime, <ArrowRight className="h-4 w-4" />, 'min', 'Time to drive one car from pickup to destination')}
                  {numInput('Shuttle Wait Time', shuttleWait, setShuttleWait, <Timer className="h-4 w-4" />, 'min', 'Average time a driver waits for the shuttle after drop-off')}
                  {numInput('Shuttle Ride Back', rideBack, setRideBack, <Bus className="h-4 w-4" />, 'min', 'Time the shuttle takes to return driver to the pickup lot')}
                  {numInput('Load / Handoff Time', loadTime, setLoadTime, <Package className="h-4 w-4" />, 'min', 'Paperwork, keys, inspection per car (default 5 min)')}

                  <Separator />

                  <TabsContent value="forward" className="mt-0 p-0">
                    {numInput('Target Deadline', deadlineHours, setDeadlineHours, <Clock className="h-4 w-4" />, 'hours', 'Available window to complete the move', 0.1)}
                  </TabsContent>
                  <TabsContent value="reverse" className="mt-0 p-0">
                    {numInput('Available Drivers', givenDrivers, setGivenDrivers, <Users className="h-4 w-4" />, 'drivers', 'How many drivers you have on hand', 1)}
                  </TabsContent>

                  <Separator />

                  {/* Shuttle capacity toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bus className="h-4 w-4 text-primary" />
                      <Label className="text-sm">Shuttle Capacity Check</Label>
                    </div>
                    <Switch checked={showShuttle} onCheckedChange={setShowShuttle} />
                  </div>

                  <AnimatePresence>
                    {showShuttle && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        {numInput('Seats per Shuttle', shuttleSeats, setShuttleSeats, <Users className="h-4 w-4" />, 'seats', 'Passenger capacity of each shuttle', 1)}
                        {numInput('Number of Shuttles', shuttleCount, setShuttleCount, <Bus className="h-4 w-4" />, 'shuttles', 'How many shuttle vehicles are running', 1)}
                        {numInput('Shuttle Cycle Time', shuttleCycleTime, setShuttleCycleTime, <ArrowRightLeft className="h-4 w-4" />, 'min', 'Round-trip time for the shuttle itself', 1)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>

            {/* ── Results Column ── */}
            <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.15 }} className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-primary text-primary-foreground">
                  <CardContent className="pt-5 pb-4 text-center">
                    <Users className="h-6 w-6 mx-auto mb-1 opacity-80" />
                    <p className="text-xs uppercase tracking-wider opacity-80">{mode === 'forward' ? 'Drivers Needed' : 'Your Drivers'}</p>
                    <p className="font-mono text-4xl font-bold mt-1">
                      {isFinite(activeDrivers) ? activeDrivers : '—'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4 text-center">
                    <Clock className="h-6 w-6 mx-auto mb-1 text-primary" />
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Completion Time</p>
                    <p className="font-mono text-4xl font-bold mt-1 text-foreground">
                      {formatTime(compTime)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4 text-center">
                    <TrendingUp className="h-6 w-6 mx-auto mb-1 text-primary" />
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Cycle Time</p>
                    <p className="font-mono text-2xl font-bold mt-1 text-foreground">{ct} min</p>
                    <p className="text-xs text-muted-foreground">per car round-trip</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4 text-center">
                    <Gauge className="h-6 w-6 mx-auto mb-1 text-primary" />
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Utilization</p>
                    <p className="font-mono text-2xl font-bold mt-1 text-foreground">{util.toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">{Math.ceil((inputs?.cars ?? 1) / Math.max(1, activeDrivers))} cars/driver</p>
                  </CardContent>
                </Card>
              </div>

              {/* Shuttle bottleneck alert */}
              {sb && sb.msg && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={sb.isBottleneck ? 'border-destructive/50 bg-destructive/5' : 'border-green-500/30 bg-green-500/5'}>
                    <CardContent className="pt-4 pb-3 flex items-start gap-3">
                      {sb.isBottleneck ? (
                        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                      ) : (
                        <Bus className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm">{sb.msg}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Summary sentence */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm leading-relaxed">
                    With <strong className="font-mono">{isFinite(activeDrivers) ? activeDrivers : '?'}</strong> driver{activeDrivers !== 1 ? 's' : ''}, each handling{' '}
                    <strong className="font-mono">{Math.ceil((inputs?.cars ?? 1) / Math.max(1, activeDrivers))}</strong> car{Math.ceil((inputs?.cars ?? 1) / Math.max(1, activeDrivers)) !== 1 ? 's' : ''}, all{' '}
                    <strong className="font-mono">{cars}</strong> cars will be delivered in{' '}
                    <strong className="font-mono">{formatTime(compTime)}</strong>.
                    Each driver cycle (load → drive → shuttle wait → ride back) takes{' '}
                    <strong className="font-mono">{ct} min</strong>.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </Tabs>

        {/* ── What-If Table ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> What-If Analysis
              </CardTitle>
              <CardDescription>Compare completion times across different driver counts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Drivers</TableHead>
                      <TableHead>Cars / Driver</TableHead>
                      <TableHead>Completion</TableHead>
                      <TableHead className="text-right">Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(whatIfData ?? []).map((row: any) => (
                      <TableRow
                        key={row?.drivers}
                        className={row?.isOptimal ? 'bg-primary/8 font-semibold' : ''}
                      >
                        <TableCell className="font-mono">
                          {row?.drivers}
                          {row?.isOptimal && (
                            <Badge variant="default" className="ml-2 text-[10px] px-1.5 py-0">optimal</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{row?.carsEach}</TableCell>
                        <TableCell className="font-mono">{formatTime(row?.time ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono">{(row?.util ?? 0).toFixed(0)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Chart */}
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-primary" /> Completion Time vs. Driver Count
                </h3>
                <div className="h-[300px] w-full">
                  <CompletionChart data={chartData} optimalDrivers={isFinite(md) ? md : undefined} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Formula Explanation ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setShowFormula((p: boolean) => !p)}
            >
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" /> How the Math Works
                </span>
                {showFormula ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <AnimatePresence>
              {showFormula && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <CardContent className="pt-0 space-y-4 text-sm leading-relaxed">
                    <div className="p-4 bg-muted rounded-lg font-mono text-xs sm:text-sm space-y-2">
                      <p><strong>Cycle Time</strong> = Load + Drive + Shuttle Wait + Ride Back</p>
                      <p>= {loadTime} + {driveTime} + {shuttleWait} + {rideBack} = <strong>{ct} min</strong></p>
                    </div>
                    <p>
                      Each driver repeats this cycle. On the <strong>last car</strong>, the driver doesn't need to ride the shuttle back — they just drive and they're done.
                    </p>
                    <div className="p-4 bg-muted rounded-lg font-mono text-xs sm:text-sm space-y-2">
                      <p><strong>Cars per Driver</strong> = 1 + ⌊(Deadline − Load − Drive) ÷ Cycle Time⌋</p>
                      <p>= 1 + ⌊({deadlineHours * 60} − {loadTime} − {driveTime}) ÷ {ct}⌋ = <strong>{cpd} cars</strong></p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg font-mono text-xs sm:text-sm space-y-2">
                      <p><strong>Min Drivers</strong> = ⌈Total Cars ÷ Cars per Driver⌉</p>
                      <p>= ⌈{cars} ÷ {cpd}⌉ = <strong>{isFinite(md) ? md : '∞'}</strong></p>
                    </div>
                    <p>
                      <strong>Utilization</strong> measures how much of each driver's time is spent actively moving cars (load + drive) versus total time on the clock.
                    </p>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pb-8 pt-4">
          Driver Calculator — Built for logistics teams
        </footer>
      </main>
    </div>
  );
}
