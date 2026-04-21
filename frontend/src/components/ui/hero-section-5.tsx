import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  Bot,
  ChevronRight,
  Droplets,
  FileText,
  HeartPulse,
  ShieldCheck,
  Waves,
} from 'lucide-react';

import { imagery } from '@/assets/imagery';
import { Button } from '@/components/ui/button';
import { InfiniteSlider } from '@/components/ui/infinite-slider';
import { ProgressiveBlur } from '@/components/ui/progressive-blur';

const sliderItems = [
  { icon: Droplets, label: 'Water readings' },
  { icon: HeartPulse, label: 'Health signals' },
  { icon: BellRing, label: 'Alert response' },
  { icon: ShieldCheck, label: 'Village trust' },
  { icon: FileText, label: 'Reports' },
  { icon: Bot, label: 'AI assistant' },
  { icon: Waves, label: 'Sensor streams' },
];

export function HeroSection() {
  return (
    <>
      <main className="overflow-x-hidden">
        <section>
          <div className="relative py-24 md:pb-28 lg:pb-32 lg:pt-64">
            <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12">
              <div className="mx-auto max-w-2xl text-center lg:ml-0 lg:max-w-[50rem] lg:text-left">
                <div className="inline-flex items-center rounded-full border border-white/55 bg-white/70 px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm backdrop-blur-md">
                  Public village intelligence, made readable
                </div>
                <h1 className="mt-8 max-w-4xl text-balance font-[var(--font-heading)] text-5xl leading-[0.95] font-extrabold text-slate-950 md:text-6xl lg:mt-16 xl:text-7xl">
                  See water, alerts, and village risk in one calm civic view
                </h1>
                <p className="mt-8 max-w-2xl text-balance text-lg leading-8 text-slate-700">
                  JALERT turns live water readings, community reports, and AI-supported village signals
                  into clear public guidance that families, field teams, and administrators can act on.
                </p>

                <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                  <Button asChild size="lg" className="h-12 rounded-full pl-5 pr-3 text-base shadow-lg shadow-sky-900/15">
                    <Link to="/feature-center">
                      <span className="text-nowrap">Explore feature center</span>
                      <ChevronRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="h-12 rounded-full border border-slate-300/80 bg-white/70 px-5 text-base text-slate-900 hover:bg-white/90"
                  >
                    <Link to="/village-status">
                      <span className="text-nowrap">Open village dashboard</span>
                    </Link>
                  </Button>
                </div>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:hidden lg:justify-start">
                  <div className="rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-md">
                    Live sensor updates
                  </div>
                  <div className="rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-md">
                    Multilingual support
                  </div>
                  <div className="rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-md">
                    Reports and alerts together
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute inset-2 overflow-hidden rounded-[2rem] border border-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.12)] sm:aspect-video lg:rounded-[3rem]">
              <img
                src={imagery.hero}
                alt="Village fields and water landscape representing JALERT village intelligence"
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/68 to-sky-950/18" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-sky-950/32 to-transparent" />

              <div className="absolute bottom-6 left-6 z-10 hidden max-w-[calc(100%-29rem)] flex-wrap items-center gap-3 lg:flex">
                <div className="rounded-full border border-white/70 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md">
                  Live sensor updates
                </div>
                <div className="rounded-full border border-white/70 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md">
                  Multilingual support
                </div>
                <div className="rounded-full border border-white/70 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md">
                  Reports and alerts together
                </div>
              </div>

              <div className="absolute bottom-6 right-6 hidden w-full max-w-sm rounded-[2rem] border border-white/45 bg-slate-950/72 p-5 text-white shadow-2xl backdrop-blur-xl md:block">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/85">
                      Latest village pulse
                    </p>
                    <h3 className="mt-2 text-2xl font-bold">Belgaon, Bastar</h3>
                  </div>
                  <span className="rounded-full bg-emerald-400/18 px-3 py-1 text-xs font-semibold text-emerald-100">
                    Updated live
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-sky-100/70">Water score</p>
                    <strong className="mt-2 block text-xl">83</strong>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-sky-100/70">Active alerts</p>
                    <strong className="mt-2 block text-xl">07</strong>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-sky-100/70">Confidence</p>
                    <strong className="mt-2 block text-xl">94%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background pb-2">
          <div className="group relative m-auto max-w-7xl px-6 lg:px-12">
            <div className="flex flex-col items-center md:flex-row">
              <div className="md:max-w-44 md:border-r md:border-slate-200 md:pr-6">
                <p className="text-end text-sm font-medium text-slate-600">Connected across the main JALERT workflows</p>
              </div>
              <div className="relative py-6 md:w-[calc(100%-11rem)]">
                <InfiniteSlider speedOnHover={20} speed={42} gap={48}>
                  {sliderItems.map((item) => (
                    <div key={item.label} className="flex">
                      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-3 text-slate-700 shadow-sm">
                        <item.icon className="size-4 text-sky-700" />
                        <span className="text-sm font-semibold">{item.label}</span>
                      </div>
                    </div>
                  ))}
                </InfiniteSlider>

                <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20" />
                <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20" />
                <ProgressiveBlur
                  className="pointer-events-none absolute left-0 top-0 h-full w-20"
                  direction="left"
                  blurIntensity={1}
                />
                <ProgressiveBlur
                  className="pointer-events-none absolute right-0 top-0 h-full w-20"
                  direction="right"
                  blurIntensity={1}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
