import {Response} from "express";
import {error, info} from "firebase-functions/logger";
import {onRequest, Request} from "firebase-functions/v2/https";
import {addJobSubbmitHistory} from "../lib/addJobSunbmit";
import {getLineId} from "../lib/lineId";
import {getLineLoginIdToken} from "../lib/lineLoginIdToken";
import {validateRequestQuery} from "../lib/validateRequestQuery";
import {verifyCSRFToken} from "../lib/verifyCSRFToken";
import {LineId, LineIdToken, RequestQuery} from "../attribute/types";
import * as consts from "../attribute/consts";

export const inquery = onRequest(
  {region: "asia-northeast1", maxInstances: 10},
  async (request: Request, response: Response) => {
    try {
      // バリデーション
      const validateResult: RequestQuery | undefined = validateRequestQuery(
        request.query
      );
      if (!validateResult) {
        error(`ユーザーからの入力値が不正です。\n入力値:\n${request.query}`);
        return;
      }
      const validatedQuery = validateResult as RequestQuery;

      // CSRFトークンの検証
      const isCSRFverify = await verifyCSRFToken(validatedQuery.state);

      // ///////ローカル検証時コメントアウト
      if (!isCSRFverify) {
        // error(`CSRF検証エラーです。state:\n${validatedQuery.state}`);
        // return;
      }

      // LINE IDトークン取得
      const redirectUri =
        consts.JOB_SEEKER_LINE_CALLBACK_URI+
        "?jobid="+
        validatedQuery.jobid+
        "&supporterid="+
        validatedQuery.supporterid;

      const lineIdTokenResult: LineIdToken | undefined =
        await getLineLoginIdToken({
          grantType: "authorization_code",
          code: validatedQuery.code,
          clientId: consts.JOB_SEEKER_LINE_CLIENT_ID,
          clientSecret: consts.JOB_SEEKER_LINE_CLIENT_SECRET,
          redirectUri: redirectUri,
        });
      if (!lineIdTokenResult) {
        error(
          `LINE IDトークンの取得に失敗しました。
          state:${validatedQuery.state}code:${validatedQuery.code}`
        );
        return;
      }
      const lineIdToken = lineIdTokenResult as LineIdToken;

      // LINE LINE ID取得
      const lineIdResult: LineId | undefined = await getLineId(
        lineIdToken,
        consts.JOB_SEEKER_LINE_CLIENT_ID
      );
      if (!lineIdResult) {
        error(`LINE IDの取得に失敗しました。:${lineIdResult}`);
        return;
      }
      const lineId = lineIdResult as LineId;

      // 応募データ保存(ユーザー認証情報はクライアントで保持しない)
      // TODO: 余裕があれば
      addJobSubbmitHistory(
        lineId,
        validatedQuery.jobid,
        validatedQuery.supporterid
      );

      info(
        `LINE応募の受付を完了しました。${lineId}, 
        ${validatedQuery.jobid} , ${validatedQuery.supporterid}`
      );
      response.redirect(`${consts.RESULT_REDIRECT_URL}?jr=true`);
    } catch (e) {
      error("全体エラー", e);
      response.json({result: "エラー"});
    }
  }
);