import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class SignalStreamService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<number>>();

  stream(signalId: string): Observable<number> {
    return this.getOrCreate(signalId).asObservable();
  }

  emit(signalId: string, count: number): void {
    this.getOrCreate(signalId).next(count);
  }

  onModuleDestroy(): void {
    for (const subject of this.streams.values()) {
      subject.complete();
    }
    this.streams.clear();
  }

  private getOrCreate(signalId: string): Subject<number> {
    let subject = this.streams.get(signalId);
    if (!subject) {
      subject = new Subject<number>();
      this.streams.set(signalId, subject);
    }
    return subject;
  }
}
