import { VoiceVisibility } from '@prisma/client';
import { AiService } from '../ai/ai.service';

async function main() {
  const ai = new AiService();
  const classification = await ai.classify({
    visibility: VoiceVisibility.GENERAL,
    area: 'KARAWANG_1',
    title: 'Pelindung mesin produksi terlepas',
    detail: 'Pelindung mesin terlepas dan berpotensi mengenai operator saat mesin dijalankan.',
  });
  const classificationValid =
    classification.source === 'AI' ||
    (classification.fallbackCode === 'LOW_CONFIDENCE' && Boolean(classification.candidate));
  if (!classificationValid) throw new Error('Live classification contract validation failed');

  const location = await ai.reviewLocation({
    area: 'KARAWANG_1',
    locationDetail: 'Gedung Produksi A, line 2, mesin press nomor 4',
  });
  if (location.fallbackCode) throw new Error('Live location contract validation failed');
  process.stdout.write('Live Responses classification and location contracts passed\n');
}

void main();
