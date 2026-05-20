import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface SignalCounts {
  acceptedCount: number;
  rejectedCount: number;
  closed?: boolean;
}

@Injectable()
export class SignalStreamService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<SignalCounts>>();

  stream(signalId: string): Observable<SignalCounts> {
    return this.getOrCreate(signalId).asObservable();
  }

  emit(signalId: string, counts: SignalCounts): void {
    this.getOrCreate(signalId).next(counts);
  }

  onModuleDestroy(): void {
    for (const subject of this.streams.values()) {
      subject.complete();
    }
    this.streams.clear();
  }

  private getOrCreate(signalId: string): Subject<SignalCounts> {
    let subject = this.streams.get(signalId);
    if (!subject) {
      subject = new Subject<SignalCounts>();
      this.streams.set(signalId, subject);
    }
    return subject;
  }
}
