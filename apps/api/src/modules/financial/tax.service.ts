import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeIndianState } from '../../common/utils/india-state.util';

interface TaxLineInput {
  amountPaise: number;
  rateBasisPoints: number;
}

export interface TaxLineSnapshot {
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

@Injectable()
export class TaxService {
  private readonly sellerState: string | null;

  constructor(config: ConfigService) {
    const configured = config.get<string>('SELLER_STATE') || '';
    this.sellerState = configured ? normalizeIndianState(configured) : null;
  }

  calculate(
    lines: TaxLineInput[],
    discountPaise: number,
    buyerState: string,
  ) {
    const normalizedBuyerState = normalizeIndianState(buyerState);
    if (!normalizedBuyerState) {
      throw new BadRequestException('A valid Indian shipping state is required');
    }

    const subtotal = lines.reduce((sum, line) => sum + line.amountPaise, 0);
    const taxablePaise = Math.max(0, subtotal - discountPaise);
    let allocatedTaxable = 0;
    const sameState =
      this.sellerState !== null && normalizedBuyerState === this.sellerState;

    const lineSnapshots = lines.map<TaxLineSnapshot>((line, index) => {
      const lineTaxable =
        index === lines.length - 1
          ? taxablePaise - allocatedTaxable
          : Math.floor(
              (line.amountPaise * taxablePaise) / Math.max(1, subtotal),
            );
      allocatedTaxable += lineTaxable;
      const lineTax = Math.floor(
        (lineTaxable * line.rateBasisPoints) / 10_000,
      );
      if (sameState) {
        const cgstPaise = Math.floor(lineTax / 2);
        return {
          taxablePaise: lineTaxable,
          taxPaise: lineTax,
          cgstPaise,
          sgstPaise: lineTax - cgstPaise,
          igstPaise: 0,
        };
      }
      return {
        taxablePaise: lineTaxable,
        taxPaise: lineTax,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: lineTax,
      };
    });

    return {
      taxablePaise,
      taxPaise: lineSnapshots.reduce((sum, line) => sum + line.taxPaise, 0),
      cgstPaise: lineSnapshots.reduce((sum, line) => sum + line.cgstPaise, 0),
      sgstPaise: lineSnapshots.reduce((sum, line) => sum + line.sgstPaise, 0),
      igstPaise: lineSnapshots.reduce((sum, line) => sum + line.igstPaise, 0),
      buyerStateCode: normalizedBuyerState,
      lines: lineSnapshots,
    };
  }

  assertActive(profile: { isActive: boolean } | null): void {
    if (profile && !profile.isActive) {
      throw new BadRequestException('A product tax profile is inactive');
    }
  }
}
