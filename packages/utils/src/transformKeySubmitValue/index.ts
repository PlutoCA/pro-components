import React from 'react';
import type { SearchTransformKeyFn } from '../typing';
import get from 'rc-util/lib/utils/get';
import namePathSet from 'rc-util/lib/utils/set';
import isNil from '../isNil';
import { merge } from '../merge';

export type DataFormatMapType = Record<string, SearchTransformKeyFn | undefined>;

/**
 * 暂时还不支持 Set和 Map 结构 判断是不是一个能遍历的对象
 *
 * @param itemValue
 * @returns Boolean
 */
export function isPlainObj(itemValue: any) {
  if (typeof itemValue !== 'object') return false;

  /** Null 也要处理，不然omit空会失效 */
  if (itemValue === null) return true;

  if (React.isValidElement(itemValue)) return false;
  if (itemValue.constructor === RegExp) return false;
  if (itemValue instanceof Map) return false;
  if (itemValue instanceof Set) return false;
  if (itemValue instanceof HTMLElement) return false;
  if (itemValue instanceof Blob) return false;
  if (itemValue instanceof File) return false;
  if (Array.isArray(itemValue)) return false;
  return true;
}

const transformKeySubmitValue = <T = any>(
  values: T,
  dataFormatMapRaw: Record<string, SearchTransformKeyFn | undefined | DataFormatMapType>,
  omit: boolean = true,
) => {
  // ignore nil transform
  const dataFormatMap = Object.keys(dataFormatMapRaw).reduce((ret, key) => {
    const value = dataFormatMapRaw[key];
    if (!isNil(value)) {
      // eslint-disable-next-line no-param-reassign
      ret[key] = value! as SearchTransformKeyFn; // can't be undefined
    }
    return ret;
  }, {} as Record<string, SearchTransformKeyFn>);

  if (Object.keys(dataFormatMap).length < 1) {
    return values;
  }

  if (typeof window === 'undefined') return values;
  // 如果 value 是 string | null | Blob类型 其中之一，直接返回
  // 形如 {key: [File, File]} 的表单字段当进行第二次递归时会导致其直接越过 typeof value !== 'object' 这一判断 https://github.com/ant-design/pro-components/issues/2071
  if (typeof values !== 'object' || isNil(values) || values instanceof Blob) {
    return values;
  }
  let finalValues = {} as T;

  const gen = (tempValues: T, parentsKey?: React.Key[]) => {
    let result = {} as T;

    if (tempValues == null || tempValues === undefined) {
      return result;
    }

    Object.keys(tempValues).forEach((entityKey) => {
      const key = parentsKey ? [parentsKey, entityKey].flat(1) : [entityKey].flat(1);
      const itemValue = tempValues[entityKey];
      const transformFunction = get(dataFormatMap, key);
      const transform = () => {
        const tempKey =
          typeof transformFunction === 'function'
            ? transformFunction?.(itemValue, entityKey, tempValues)
            : entityKey;
        // { [key:string]:any } 数组也能通过编译
        if (Array.isArray(tempKey)) {
          result = namePathSet(result, tempKey, itemValue);
          return;
        }
        if (typeof tempKey === 'object') {
          finalValues = {
            ...finalValues,
            ...tempKey,
          };
        } else if (tempKey) {
          result = namePathSet(result, [tempKey], itemValue);
        }
      };

      /** 如果存在转化器提前渲染一下 */
      if (transformFunction && typeof transformFunction === 'function') {
        transform();
      }

      if (typeof window === 'undefined') return;
      if (isPlainObj(itemValue)) {
        const genValues = gen(itemValue, key);
        if (Object.keys(genValues).length < 1) {
          return;
        }
        result = namePathSet(result, [entityKey], genValues);
        return;
      }
      transform();
    });
    // namePath、transform在omit为false时需正常返回 https://github.com/ant-design/pro-components/issues/2901#issue-908097115
    return omit ? result : tempValues;
  };

  finalValues = merge({}, gen(values), finalValues);

  return finalValues;
};

export default transformKeySubmitValue;
