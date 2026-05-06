import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Lock, Users, Upload, Activity } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const steps = [
  { icon: Lock, key: 'guideVault' },
  { icon: Users, key: 'guideGroups' },
  { icon: Upload, key: 'guideImport' },
  { icon: Activity, key: 'guideAudit' },
];

const OnboardingGuide = () => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (localStorage.getItem('m-password-guide-seen') !== 'true') setOpen(true);
  }, []);

  const finish = () => {
    localStorage.setItem('m-password-guide-seen', 'true');
    setOpen(false);
    setStep(0);
  };

  const CurrentIcon = steps[step].icon;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="hidden sm:inline-flex text-gray-600">
        {t('showGuide')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('guideTitle')}</DialogTitle></DialogHeader>
          <div className="py-6 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <CurrentIcon className="h-8 w-8" />
            </div>
            <p className="text-lg font-medium text-gray-900">{t(steps[step].key)}</p>
            <div className="mt-6 flex justify-center gap-2">
              {steps.map((item, index) => (
                <span key={item.key} className={`h-2 w-8 rounded-full ${index === step ? 'bg-blue-600' : 'bg-gray-200'}`} />
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={finish}>{t('skip')}</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>{t('back')}</Button>
              {step < steps.length - 1 ? <Button onClick={() => setStep((value) => value + 1)}>{t('next')}</Button> : <Button onClick={finish}>{t('finish')}</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OnboardingGuide;
